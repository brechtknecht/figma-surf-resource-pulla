figma.showUI(__html__);

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

const processNode = async (node: SceneNode, index: number, total: number) => {
  const prefix = total > 1 ? `[${index + 1}/${total}] ` : '';
  
  if (!node.name.startsWith('http')) {
    sendStatus(`${prefix}URL Check`, `Skipped: ${node.name} (no URL)`, 'error');
    return;
  }

  const url = node.name;
  sendStatus(`${prefix}URL Found`, url, 'success');

  // Check if this is an empty frame (special case for direct screenshot)
  const isEmptyFrame = 'children' in node && node.children.length === 0;
  if (isEmptyFrame) {
    sendStatus(`${prefix}Empty Frame`, 'Detected - will fill with screenshot', 'success');
    await fillEmptyFrameWithScreenshot(node, url, prefix);
    return;
  }

  try {
    sendStatus(`${prefix}Fetching Metadata`, 'Connecting to server...', 'pending');
    
    // Check if screenshot layer exists to request screenshot
    const needsScreenshot = !!findLayerByName(node, 'data:screenshot');
    
    const metadataResponse = await fetch(`http://localhost:3000/metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        url,
        width: 'width' in node ? node.width : 800,
        height: 'height' in node ? node.height : 600,
        needsScreenshot
      }),
    });

    if (!metadataResponse.ok) {
      sendStatus(`${prefix}Fetching Metadata`, `Failed: ${metadataResponse.status}`, 'error', 'update');
      return;
    }

    const metadataData = await metadataResponse.json();
    if (!metadataData.success) {
      sendStatus(`${prefix}Fetching Metadata`, 'Server error', 'error', 'update');
      return;
    }

    sendStatus(`${prefix}Fetching Metadata`, 'Complete', 'success', 'update');
    const metadata = metadataData.metadata;

    // Update text layers
    const titleLayer = findLayerByName(node, 'data:title');
    if (titleLayer && titleLayer.type === 'TEXT' && metadata.title) {
      await figma.loadFontAsync(titleLayer.fontName as FontName);
      titleLayer.characters = metadata.title;
      sendStatus(`${prefix}Title Layer`, `Set: ${metadata.title.substring(0, 20)}...`, 'success');
    } else {
      sendStatus(`${prefix}Title Layer`, !titleLayer ? 'data:title not found' : !metadata.title ? 'No data' : 'Wrong type', 'error');
    }

    const descLayer = findLayerByName(node, 'data:description');
    if (descLayer && descLayer.type === 'TEXT' && metadata.description) {
      await figma.loadFontAsync(descLayer.fontName as FontName);
      descLayer.characters = metadata.description;
      sendStatus(`${prefix}Description Layer`, `Set: ${metadata.description.substring(0, 20)}...`, 'success');
    } else {
      sendStatus(`${prefix}Description Layer`, !descLayer ? 'data:description not found' : !metadata.description ? 'No data' : 'Wrong type', 'error');
    }

    const sourceLayer = findLayerByName(node, 'data:sourceURL');
    if (sourceLayer && sourceLayer.type === 'TEXT' && metadata.hostname) {
      await figma.loadFontAsync(sourceLayer.fontName as FontName);
      sourceLayer.characters = metadata.hostname;
      sendStatus(`${prefix}Source URL Layer`, `Set: ${metadata.hostname}`, 'success');
    } else {
      sendStatus(`${prefix}Source URL Layer`, !sourceLayer ? 'data:sourceURL not found' : !metadata.hostname ? 'No data' : 'Wrong type', 'error');
    }

    // Handle images - check for both cover and screenshot layers
    const coverLayer = findLayerByName(node, 'data:cover');
    const screenshotLayer = findLayerByName(node, 'data:screenshot');
    
    // Handle cover layer (og:image or fallback screenshot)
    if (coverLayer && ('fills' in coverLayer) && metadataData.coverImage) {
      try {
        const coverBytes = base64ToUint8Array(metadataData.coverImage.split('base64,')[1]);
        const coverHash = figma.createImage(coverBytes).hash;
        coverLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: coverHash }];
        sendStatus(`${prefix}Cover Layer`, 'Image applied', 'success');
      } catch (error) {
        sendStatus(`${prefix}Cover Layer`, `Error: ${error}`, 'error');
      }
    } else if (coverLayer) {
      sendStatus(`${prefix}Cover Layer`, !('fills' in coverLayer) ? 'No fills' : 'No image data', 'error');
    }
    
    // Handle screenshot layer (always gets screenshot)
    if (screenshotLayer && ('fills' in screenshotLayer) && metadataData.screenshotImage) {
      try {
        const screenshotBytes = base64ToUint8Array(metadataData.screenshotImage.split('base64,')[1]);
        const screenshotHash = figma.createImage(screenshotBytes).hash;
        screenshotLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: screenshotHash }];
        sendStatus(`${prefix}Screenshot Layer`, 'Screenshot applied', 'success');
      } catch (error) {
        sendStatus(`${prefix}Screenshot Layer`, `Error: ${error}`, 'error');
      }
    } else if (screenshotLayer) {
      sendStatus(`${prefix}Screenshot Layer`, !('fills' in screenshotLayer) ? 'No fills' : 'No screenshot data', 'error');
    }

    const faviconLayer = findLayerByName(node, 'data:favicon');
    if (faviconLayer && ('fills' in faviconLayer) && metadataData.faviconImage) {
      try {
        const faviconBytes = base64ToUint8Array(metadataData.faviconImage.split('base64,')[1]);
        const faviconHash = figma.createImage(faviconBytes).hash;
        faviconLayer.fills = [{ type: 'IMAGE', scaleMode: 'FILL', imageHash: faviconHash }];
        sendStatus(`${prefix}Favicon Layer`, 'Image applied', 'success');
      } catch (error) {
        sendStatus(`${prefix}Favicon Layer`, `Error: ${error}`, 'error');
      }
    } else {
      const reason = !faviconLayer ? 'data:favicon not found' : 
                    !('fills' in faviconLayer) ? 'No fills' : 
                    'No favicon data';
      sendStatus(`${prefix}Favicon Layer`, reason, 'error');
    }

  } catch (error) {
    sendStatus(`${prefix}Error`, error instanceof Error ? error.message : String(error), 'error');
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
    sendStatus('No URLs Found', 'Please set URLs as component/frame names', 'error');
    return;
  }

  sendStatus('Processing', `${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''} found`, 'success');

  // Process each node
  for (let i = 0; i < urlNodes.length; i++) {
    await processNode(urlNodes[i], i, urlNodes.length);
  }

  sendStatus('All Complete', `Processed ${urlNodes.length} item${urlNodes.length > 1 ? 's' : ''}`, 'success');
};

figma.on('run', runProcessing);

// Handle UI messages
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'run') {
    await runProcessing();
  }
};


