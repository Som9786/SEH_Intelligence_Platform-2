const PADDING = 24;

/**
 * A standalone copy of a rendered Mermaid diagram: sized from its viewBox (not the on-screen zoom),
 * with the namespaces an image needs. Mermaid keeps its styles inside the SVG, so it draws alone.
 */
function standaloneSvg(svg: SVGSVGElement): {
  xml: string;
  width: number;
  height: number;
} {
  const box = svg.viewBox.baseVal;
  const width = Math.ceil(box?.width || svg.getBoundingClientRect().width);
  const height = Math.ceil(box?.height || svg.getBoundingClientRect().height);
  const copy = svg.cloneNode(true) as SVGSVGElement;
  // On the page the HTML labels inherit the app's font; a standalone image has nothing to inherit from.
  copy.setAttribute(
    'style',
    `font-family: ${getComputedStyle(svg).fontFamily}`,
  );
  copy.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  copy.setAttribute('width', String(width));
  copy.setAttribute('height', String(height));
  copy.querySelectorAll('[tabindex], [role], [aria-label]').forEach((el) => {
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
  });
  return { xml: new XMLSerializer().serializeToString(copy), width, height };
}

export function svgToBlob(svg: SVGSVGElement): Blob {
  return new Blob([standaloneSvg(svg).xml], {
    type: 'image/svg+xml;charset=utf-8',
  });
}

/** Draws the diagram onto a canvas with a solid background (SVG itself is transparent). */
export async function svgToPngBlob(
  svg: SVGSVGElement,
  background: string,
  scale = 2,
): Promise<Blob> {
  const { xml, width, height } = standaloneSvg(svg);
  const image = new Image();
  const loaded = new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () =>
      reject(new Error('The diagram could not be drawn as an image.'));
  });
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  await loaded;

  const canvas = document.createElement('canvas');
  canvas.width = (width + PADDING * 2) * scale;
  canvas.height = (height + PADDING * 2) * scale;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas is not available.');
  context.scale(scale, scale);
  context.fillStyle = background;
  context.fillRect(0, 0, width + PADDING * 2, height + PADDING * 2);
  context.drawImage(image, PADDING, PADDING, width, height);
  return new Promise((resolve, reject) =>
    // toBlob yields null when the browser treats the canvas as tainted.
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error('PNG export was blocked.')),
      'image/png',
    ),
  );
}
