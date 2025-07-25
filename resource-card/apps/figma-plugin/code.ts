// UI will be shown conditionally based on ::dev flag

// Global variable to store active session IDs
let activeInteractiveSessions: string[] = [];

// Store continue handlers for notification-based interactions
let continueHandlers: { [sessionId: string]: () => void } = {};

const findLayerByName = (node: SceneNode, name: string): SceneNode | null => {
  if (node.name === name) return node;
  if ('children' in node) {
    for (const child of node.children) {
      const found = findLayerByName(child, name);
      if (found) return found;
    }
  }
  return null;
};

const findScreenshotLayer = (node: SceneNode): SceneNode | null => {
  if (node.name.startsWith('data:screenshot')) return node;
  if ('children' in node) {
    for (const child of node.children) {
      const found = findScreenshotLayer(child);
      if (found) return found;
    }
  }
  return null;
};

const base64ToUint8Array = (base64: string): Uint8Array => {
  // Simple base64 decoder for Figma environment
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let result = '';
  let i = 0;
  
  base64 = base64.replace(/[^A-Za-z0-9+/]/g, '');
  
  while (i < base64.length) {
    const encoded1 = chars.indexOf(base64.charAt(i++));
    const encoded2 = chars.indexOf(base64.charAt(i++));
    const encoded3 = chars.indexOf(base64.charAt(i++));
    const encoded4 = chars.indexOf(base64.charAt(i++));
    
    const bitmap = (encoded1 << 18) | (encoded2 << 12) | (encoded3 << 6) | encoded4;
    
    result += String.fromCharCode((bitmap >> 16) & 255);
    if (encoded3 !== 64) result += String.fromCharCode((bitmap >> 8) & 255);
    if (encoded4 !== 64) result += String.fromCharCode(bitmap & 255);
  }
  
  const bytes = new Uint8Array(result.length);
  for (let j = 0; j < result.length; j++) {
    bytes[j] = result.charCodeAt(j);
  }
  return bytes;
};

const sendStatus = (label: string, value: string, statusType: 'pending' | 'success' | 'error' = 'pending', action: 'add' | 'update' = 'add') => {
  figma.ui.postMessage({ type: 'status', action, label, value, statusType });
};

const sendNotification = (message: string, options?: NotificationOptions) => {
  figma.notify(message, options);
};

const parseUrl = (rawUrl: string): { url: string; openBrowser: boolean; scaleFactor: number; devMode: boolean } => {
  let cleanUrl = rawUrl;
  let openBrowser = false;
  let scaleFactor = 2; // Default to 2x
  let devMode = false;
  
  // Check for ::dev parameter
  if (cleanUrl.includes('::dev')) {
    devMode = true;
    cleanUrl = cleanUrl.replace('::dev', '');
  }
  
  // Check for ::openBrowser parameter
  if (cleanUrl.includes('::openBrowser')) {
    openBrowser = true;
    cleanUrl = cleanUrl.replace('::openBrowser', '');
  }
  
  // Check for ::@Nx parameter (e.g., ::@1x, ::@2x, ::@1.5x, etc.)
  const scaleMatch = cleanUrl.match(/::\@(\d+(?:\.\d+)?)x?/);
  if (scaleMatch) {
    const scale = parseFloat(scaleMatch[1]);
    if (!isNaN(scale) && scale > 0) {
      scaleFactor = scale;
    }
    cleanUrl = cleanUrl.replace(scaleMatch[0], '');
  }
  
  return {
    url: cleanUrl,
    openBrowser,
    scaleFactor,
    devMode
  };
};

const parseScreenshotProperties = (screenshotLayerName: string): { openBrowser: boolean; scaleFactor: number } => {
  let openBrowser = false;
  let scaleFactor = 2; // Default to 2x
  
  // Check for ::openBrowser parameter in screenshot layer name
  if (screenshotLayerName.includes('::openBrowser')) {
    openBrowser = true;
  }
  
  // Check for ::@Nx parameter in screenshot layer name
  const scaleMatch = screenshotLayerName.match(/::\@(\d+(?:\.\d+)?)x?/);
  if (scaleMatch) {
    const scale = parseFloat(scaleMatch[1]);
    if (!isNaN(scale) && scale > 0) {
      scaleFactor = scale;
    }
  }
  
  return {
    openBrowser,
    scaleFactor
  };
};

const processMetadataResults = async (node: SceneNode, metadataData: any, prefix: string, useDevMode: boolean = true) => {
  if (useDevMode) {
    sendStatus(`${prefix}Fetching Metadata`, 'Complete', 'success', 'update');
  }
  const metadata = metadataData.metadata;

  // Update text layers
  const titleLayer = findLayerByName(node, 'data:title');
  if (titleLayer && titleLayer.type === 'TEXT' && metadata.title) {
    await figma.loadFontAsync(titleLayer.fontName as FontName);
    titleLayer.characters = metadata.title;
    if (useDevMode) {
      sendStatus(`${prefix}Title Layer`, `Set: ${metadata.title.substring(0, 20)}...`, 'success');
    }
  } else {
    if (useDevMode) {
      sendStatus(`${prefix}Title Layer`, !titleLayer ? 'data:title not found' : !metadata.title ? 'No data' : 'Wrong type', 'error');
    }
  }

  const descLayer = findLayerByName(node, 'data:description');
  if (descLayer && descLayer.type === 'TEXT' && metadata.description) {
    await figma.loadFontAsync(descLayer.fontName as FontName);
    descLayer.characters = metadata.description;
    if (useDevMode) {
      sendStatus(`${prefix}Description Layer`, `Set: ${metadata.description.substring(0, 20)}...`, 'success');
    }
  } else {
    if (useDevMode) {
      sendStatus(`${prefix}Description Layer`, !descLayer ? 'data:description not found' : !metadata.description ? 'No data' : 'Wrong type', 'error');
    }
  }

  const sourceLayer = findLayerByName(node, 'data:sourceURL');
  if (sourceLayer && sourceLayer.type === 'TEXT' && metadata.hostname) {
    await figma.loadFontAsync(sourceLayer.fontName as FontName);
    sourceLayer.characters = metadata.hostname;
    if (useDevMode) {
      sendStatus(`${prefix}Source URL Layer`, `Set: ${metadata.hostname}`, 'success');
    }
  } else {
    if (useDevMode) {
      sendStatus(`${prefix}Source URL Layer`, !sourceLayer ? 'data:sourceURL not found' : !metadata.hostname ? 'No data' : 'Wrong type', 'error');
    }
  }

  // Handle images - check for both cover and screenshot layers
  const coverLayer = findLayerByName(node, 'data:cover');
  const screenshotLayer = findScreenshotLayer(node);
  
  // Handle cover layer (og:image or fallback screenshot)
  if (coverLayer && ('fills' in coverLayer) && metadataData.coverImage) {
    try {
      const coverBytes = base64ToUint8Array(metadataData.coverImage.split('base64,')[1]);
      const coverHash = figma.createImage(coverBytes).hash;
      coverLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: coverHash }];
      if (useDevMode) {
        sendStatus(`${prefix}Cover Layer`, 'Image applied', 'success');
      }
    } catch (error) {
      if (useDevMode) {
        sendStatus(`${prefix}Cover Layer`, `Error: ${error}`, 'error');
      }
    }
  } else if (coverLayer) {
    if (useDevMode) {
      sendStatus(`${prefix}Cover Layer`, !('fills' in coverLayer) ? 'No fills' : 'No image data', 'error');
    }
  }
  
  // Handle screenshot layer (always gets screenshot)
  if (screenshotLayer && ('fills' in screenshotLayer) && metadataData.screenshotImage) {
    try {
      const screenshotBytes = base64ToUint8Array(metadataData.screenshotImage.split('base64,')[1]);
      const screenshotHash = figma.createImage(screenshotBytes).hash;
      screenshotLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: screenshotHash }];
      if (useDevMode) {
        sendStatus(`${prefix}Screenshot Layer`, 'Screenshot applied', 'success');
      }
    } catch (error) {
      if (useDevMode) {
        sendStatus(`${prefix}Screenshot Layer`, `Error: ${error}`, 'error');
      }
    }
  } else if (screenshotLayer) {
    if (useDevMode) {
      sendStatus(`${prefix}Screenshot Layer`, !('fills' in screenshotLayer) ? 'No fills' : 'No screenshot data', 'error');
    }
  }

  const faviconLayer = findLayerByName(node, 'data:favicon');
  if (faviconLayer && ('fills' in faviconLayer) && metadataData.faviconImage) {
    try {
      const faviconBytes = base64ToUint8Array(metadataData.faviconImage.split('base64,')[1]);
      const faviconHash = figma.createImage(faviconBytes).hash;
      faviconLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: faviconHash }];
      if (useDevMode) {
        sendStatus(`${prefix}Favicon Layer`, 'Image applied', 'success');
      }
    } catch (error) {
      if (useDevMode) {
        sendStatus(`${prefix}Favicon Layer`, `Error: ${error}`, 'error');
      }
    }
  } else {
    const reason = !faviconLayer ? 'data:favicon not found' : 
                  !('fills' in faviconLayer) ? 'No fills' : 
                  'No favicon data';
    if (useDevMode) {
      sendStatus(`${prefix}Favicon Layer`, reason, 'error');
    }
  }
};

const fillEmptyFrameWithScreenshot = async (node: SceneNode, url: string, openBrowser: boolean, scaleFactor: number, prefix: string, useDevMode: boolean = true) => {
  try {
    if (useDevMode) {
      sendStatus(`${prefix}Screenshot`, 'Requesting screenshot...', 'pending');
    }
    
    if (openBrowser) {
      // Start interactive session
      const initResponse = await fetch(`http://localhost:3000/interactive-capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          width: 'width' in node ? Math.floor(node.width * scaleFactor) : Math.floor(1200 * scaleFactor),
          height: 'height' in node ? Math.floor(node.height * scaleFactor) : Math.floor(800 * scaleFactor)
        }),
      });
      
      if (!initResponse.ok) {
        throw new Error(`Interactive capture failed: ${initResponse.status}`);
      }
      
      const initData = await initResponse.json();
      if (!initData.success) {
        throw new Error('Interactive capture initialization failed');
      }
      
      const sessionId = initData.sessionId;
      activeInteractiveSessions.push(sessionId);
      
      // Show interactive controls to user
      if (useDevMode) {
        sendStatus(`${prefix}Interactive Mode`, 'Browser opened - complete your actions', 'pending');
        figma.ui.postMessage({ 
          type: 'interactive-mode', 
          message: `Browser opened for ${url}. Handle cookie banners and scroll as needed, then click Continue.`,
          sessionId 
        });
      } else {
        // Use notification with button for non-dev interactive mode
        sendNotification(`Browser opened for ${url}. Complete your actions, then click Continue.`, {
          timeout: Infinity,
          button: {
            text: 'Continue',
            action: () => {
              // Trigger the continue handler directly
              if (continueHandlers[sessionId]) {
                continueHandlers[sessionId]();
                delete continueHandlers[sessionId];
              }
              return true; // Dismiss the notification
            }
          }
        });
      }
      
      // Wait for user to continue (with timeout)
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          activeInteractiveSessions = activeInteractiveSessions.filter(id => id !== sessionId);
          if (useDevMode) {
            sendStatus(`${prefix}Interactive Mode`, 'Timeout - session expired', 'error', 'update');
          } else {
            delete continueHandlers[sessionId];
            sendNotification('Interactive session timeout', { error: true });
          }
          reject(new Error('Interactive session timeout'));
        }, 10 * 60 * 1000); // 10 minute timeout
        
        const processContinue = async () => {
          clearTimeout(timeoutId);
          // Remove the session from active sessions
          activeInteractiveSessions = activeInteractiveSessions.filter(id => id !== sessionId);
          
          try {
            if (useDevMode) {
              sendStatus(`${prefix}Interactive Mode`, 'Taking screenshot...', 'pending', 'update');
            } else {
              sendNotification('Taking screenshot...');
            }
            
            const continueResponse = await fetch(`http://localhost:3000/continue-capture`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            
            if (!continueResponse.ok) {
              throw new Error(`Continue capture failed: ${continueResponse.status}`);
            }
            
            const continueData = await continueResponse.json();
            if (continueData.success && continueData.imageUrl) {
              const imageBytes = base64ToUint8Array(continueData.imageUrl.split('base64,')[1]);
              const imageHash = figma.createImage(imageBytes).hash;
              
              if ('fills' in node) {
                node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];
                if (useDevMode) {
                  sendStatus(`${prefix}Interactive Mode`, 'Screenshot applied to frame', 'success', 'update');
                } else {
                  sendNotification(`Screenshot applied for ${url}`);
                }
              } else {
                if (useDevMode) {
                  sendStatus(`${prefix}Interactive Mode`, 'Frame cannot have fills', 'error', 'update');
                } else {
                  sendNotification('Frame cannot have fills', { error: true });
                }
              }
              
              resolve(undefined);
            } else {
              throw new Error('Continue capture response invalid');
            }
          } catch (error) {
            if (useDevMode) {
              sendStatus(`${prefix}Interactive Mode`, `Error: ${error instanceof Error ? error.message : String(error)}`, 'error', 'update');
            } else {
              sendNotification(`Error: ${error instanceof Error ? error.message : String(error)}`, { error: true });
            }
            reject(error);
          }
        };
        
        if (useDevMode) {
          const continueHandler = async (msg: any) => {
            if (msg.type === 'continue' && activeInteractiveSessions.includes(sessionId)) {
                await processContinue();
            }
          };
          figma.ui.on('message', continueHandler);
        } else {
          // Store the continue handler for notification button
          continueHandlers[sessionId] = processContinue;
        }
      });
    } else {
      // Regular non-interactive capture
      const response = await fetch(`http://localhost:3000/capture`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          width: 'width' in node ? Math.floor(node.width * scaleFactor) : Math.floor(1200 * scaleFactor),
          height: 'height' in node ? Math.floor(node.height * scaleFactor) : Math.floor(800 * scaleFactor)
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Screenshot failed: ${response.status}`);
      }
      
      const data = await response.json();
      if (data.success && data.imageUrl) {
        const imageBytes = base64ToUint8Array(data.imageUrl.split('base64,')[1]);
        const imageHash = figma.createImage(imageBytes).hash;
        
        if ('fills' in node) {
          node.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash }];
          if (useDevMode) {
            sendStatus(`${prefix}Screenshot`, 'Applied to frame', 'success', 'update');
          } else {
            sendNotification(`Screenshot applied for ${url}`);
          }
        } else {
          if (useDevMode) {
            sendStatus(`${prefix}Screenshot`, 'Frame cannot have fills', 'error', 'update');
          } else {
            sendNotification('Frame cannot have fills', { error: true });
          }
        }
      } else {
        throw new Error('Screenshot response invalid');
      }
    }

  } catch (error) {
    if (useDevMode) {
      sendStatus(`${prefix}Screenshot`, `Error: ${error instanceof Error ? error.message : String(error)}`, 'error', 'update');
    } else {
      sendNotification(`Screenshot error: ${error instanceof Error ? error.message : String(error)}`, { error: true });
    }
  }
};

const processNode = async (node: SceneNode, index: number, total: number, useDevMode: boolean) => {
  const prefix = total > 1 ? `[${index + 1}/${total}] ` : '';
  
  if (!node.name.startsWith('http')) {
    if (useDevMode) {
      sendStatus(`${prefix}URL Check`, `Skipped: ${node.name} (no URL)`, 'error');
    } else {
      sendNotification(`Skipped: ${node.name} (no URL)`);
    }
    return;
  }

  let { url, openBrowser, scaleFactor, devMode } = parseUrl(node.name);
  
  // Check if this is an empty frame (special case for direct screenshot)
  const isEmptyFrame = 'children' in node && node.children.length === 0;
  if (isEmptyFrame) {
    if (useDevMode) {
      sendStatus(`${prefix}URL Found`, url + (openBrowser ? ' (Interactive Mode)' : '') + (scaleFactor !== 2 ? ` (@${scaleFactor}x)` : ''), 'success');
      sendStatus(`${prefix}Empty Frame`, 'Detected - will fill with screenshot', 'success');
    } else {
      sendNotification(`Taking screenshot for ${url}${openBrowser ? ' (Interactive)' : ''}`);
    }
    await fillEmptyFrameWithScreenshot(node, url, openBrowser, scaleFactor, useDevMode ? prefix : '', useDevMode);
    return;
  }

  try {
    if (useDevMode) {
      sendStatus(`${prefix}Fetching Metadata`, 'Connecting to server...', 'pending');
    } else {
      sendNotification(`Processing ${url}${openBrowser ? ' (Interactive)' : ''}`);
    }
    
    // Check if screenshot layer exists to request screenshot
    const screenshotLayer = findScreenshotLayer(node);
    const needsScreenshot = !!screenshotLayer;
    
    // If screenshot layer exists, merge its properties with frame properties
    // Screenshot layer properties override frame properties
    if (screenshotLayer) {
      const screenshotProps = parseScreenshotProperties(screenshotLayer.name);
      if (screenshotLayer.name.includes('::openBrowser')) {
        openBrowser = screenshotProps.openBrowser;
      }
      if (screenshotLayer.name.includes('::@')) {
        scaleFactor = screenshotProps.scaleFactor;
      }
    }
    
    if (useDevMode) {
      sendStatus(`${prefix}URL Found`, url + (openBrowser ? ' (Interactive Mode)' : '') + (scaleFactor !== 2 ? ` (@${scaleFactor}x)` : ''), 'success');
    }
    
    // Calculate dimensions - use screenshot layer dimensions if it exists, otherwise use frame dimensions
    const dimensionSource = screenshotLayer && 'width' in screenshotLayer ? screenshotLayer : node;
    const screenshotWidth = 'width' in dimensionSource ? Math.floor(dimensionSource.width * scaleFactor) : Math.floor(800 * scaleFactor);
    const screenshotHeight = 'height' in dimensionSource ? Math.floor(dimensionSource.height * scaleFactor) : Math.floor(600 * scaleFactor);
    
    if (openBrowser) {
      // Start interactive metadata session
      const initResponse = await fetch(`http://localhost:3000/interactive-metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          width: screenshotWidth,
          height: screenshotHeight,
          needsScreenshot
        }),
      });
      
      if (!initResponse.ok) {
        if (useDevMode) {
          sendStatus(`${prefix}Fetching Metadata`, `Failed: ${initResponse.status}`, 'error', 'update');
        } else {
          sendNotification(`Failed to start interactive session: ${initResponse.status}`, { error: true });
        }
        return;
      }
      
      const initData = await initResponse.json();
      if (!initData.success) {
        if (useDevMode) {
          sendStatus(`${prefix}Fetching Metadata`, 'Server error', 'error', 'update');
        } else {
          sendNotification('Server error starting interactive session', { error: true });
        }
        return;
      }
      
      const sessionId = initData.sessionId;
      activeInteractiveSessions.push(sessionId);
      
      // Show interactive controls to user
      if (useDevMode) {
        sendStatus(`${prefix}Interactive Mode`, 'Browser opened - complete your actions', 'pending');
        figma.ui.postMessage({ 
          type: 'interactive-mode', 
          message: `Browser opened for ${url}. Handle cookie banners and scroll as needed, then click Continue.`,
          sessionId 
        });
      } else {
        // Use notification with button for non-dev interactive mode
        sendNotification(`Browser opened for ${url}. Complete your actions, then click Continue.`, {
          timeout: Infinity,
          button: {
            text: 'Continue',
            action: () => {
              // Trigger the continue handler directly
              if (continueHandlers[sessionId]) {
                continueHandlers[sessionId]();
                delete continueHandlers[sessionId];
              }
              return true; // Dismiss the notification
            }
          }
        });
      }
      
      // Wait for user to continue (with timeout)
      await new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          activeInteractiveSessions = activeInteractiveSessions.filter(id => id !== sessionId);
          if (useDevMode) {
            sendStatus(`${prefix}Interactive Mode`, 'Timeout - session expired', 'error', 'update');
          } else {
            delete continueHandlers[sessionId];
            sendNotification('Interactive session timeout', { error: true });
          }
          reject(new Error('Interactive session timeout'));
        }, 10 * 60 * 1000); // 10 minute timeout
        
        const processContinue = async () => {
          clearTimeout(timeoutId);
          // Remove the session from active sessions
          activeInteractiveSessions = activeInteractiveSessions.filter(id => id !== sessionId);
          
          try {
            if (useDevMode) {
              sendStatus(`${prefix}Interactive Mode`, 'Processing metadata...', 'pending', 'update');
            } else {
              sendNotification('Processing metadata...');
            }
            
            const continueResponse = await fetch(`http://localhost:3000/continue-metadata`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sessionId }),
            });
            
            if (!continueResponse.ok) {
              throw new Error(`Continue metadata failed: ${continueResponse.status}`);
            }
            
            const metadataData = await continueResponse.json();
            if (!metadataData.success) {
              throw new Error('Continue metadata response invalid');
            }
            
            // Process the metadata (same as regular flow)
            await processMetadataResults(node, metadataData, useDevMode ? prefix : '', useDevMode);
            
            if (!useDevMode) {
              sendNotification(`Completed processing for ${url}`);
            }
            
            resolve(undefined);
          } catch (error) {
            if (useDevMode) {
              sendStatus(`${prefix}Interactive Mode`, `Error: ${error instanceof Error ? error.message : String(error)}`, 'error', 'update');
            } else {
              sendNotification(`Error processing ${url}: ${error instanceof Error ? error.message : String(error)}`, { error: true });
            }
            reject(error);
          }
        };
        
        if (useDevMode) {
          const continueHandler = async (msg: any) => {
            if (msg.type === 'continue' && activeInteractiveSessions.includes(sessionId)) {
                await processContinue();
            }
          };
          figma.ui.on('message', continueHandler);
        } else {
          // Store the continue handler for notification button
          continueHandlers[sessionId] = processContinue;
        }
      });
    } else {
      // Regular non-interactive metadata
      const metadataResponse = await fetch(`http://localhost:3000/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url,
          width: screenshotWidth,
          height: screenshotHeight,
          needsScreenshot
        }),
      });
      
      if (!metadataResponse.ok) {
        if (useDevMode) {
          sendStatus(`${prefix}Fetching Metadata`, `Failed: ${metadataResponse.status}`, 'error', 'update');
        } else {
          sendNotification(`Failed to fetch metadata for ${url}: ${metadataResponse.status}`, { error: true });
        }
        return;
      }
      
      const metadataData = await metadataResponse.json();
      if (!metadataData.success) {
        if (useDevMode) {
          sendStatus(`${prefix}Fetching Metadata`, 'Server error', 'error', 'update');
        } else {
          sendNotification(`Server error processing ${url}`, { error: true });
        }
        return;
      }
      
      await processMetadataResults(node, metadataData, useDevMode ? prefix : '', useDevMode);
      
      if (!useDevMode) {
        sendNotification(`Completed processing for ${url}`);
      }
    }


  } catch (error) {
    if (useDevMode) {
      sendStatus(`${prefix}Error`, error instanceof Error ? error.message : String(error), 'error');
    } else {
      sendNotification(`Error: ${error instanceof Error ? error.message : String(error)}`, { error: true });
    }
  }
};

const runProcessing = async () => {
  const nodes = figma.currentPage.selection;
  if (nodes.length === 0) {
    figma.notify('Please select one or more frames/components.');
    return;
  }

  // Filter nodes that have URLs
  const urlNodes = nodes.filter(node => node.name.startsWith('http'));
  
  if (urlNodes.length === 0) {
    sendNotification('No URLs found. Please set URLs as component/frame names.');
    return;
  }

  // Check if any nodes have dev mode enabled - if so, show UI
  const hasDevMode = urlNodes.some(node => parseUrl(node.name).devMode);
  
  if (hasDevMode) {
    // Show UI for dev mode
    figma.showUI(__html__);
  }

  // Check if any nodes have interactive mode enabled
  const hasInteractiveNodes = urlNodes.some(node => parseUrl(node.name).openBrowser);
  if (hasInteractiveNodes && hasDevMode) {
    sendStatus('Interactive Mode', 'Browser(s) will open for manual interaction', 'pending');
  }

  if (hasDevMode) {
    sendStatus('Processing', `${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''} found`, 'success');
  } else {
    sendNotification(`Processing ${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''}...`);
  }

  // Process each node
  for (let i = 0; i < urlNodes.length; i++) {
    await processNode(urlNodes[i], i, urlNodes.length, hasDevMode);
  }

  if (hasDevMode) {
    sendStatus('All Complete', `Processed ${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''}`, 'success');
  } else {
    sendNotification(`Completed processing ${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''}`);
  }
};

figma.on('run', runProcessing);

// Handle UI messages and notification actions
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'run') {
    await runProcessing();
  } else if (msg.type === 'continue') {
    // This is handled by the individual promise handlers in the processing functions
    // No additional action needed here
  }
};

// Notification-based mode provides lightweight feedback while dev mode shows detailed UI

// Clean up any lingering interactive sessions on plugin close
figma.on('close', async () => {
  if (activeInteractiveSessions.length > 0) {
    console.log('Cleaning up interactive sessions on plugin close');
    // Note: We can't directly close browser sessions from here, 
    // but the server has a cleanup interval for expired sessions
  }
});


