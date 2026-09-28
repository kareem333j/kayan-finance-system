import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

async function makeIcon() {
  try {
    const inputPath = path.resolve('assets/brand/logo.svg');
    const pngPath = path.resolve('assets/brand/icon.png');
    const icoPath = path.resolve('assets/brand/icon.ico');

    // Convert SVG to PNG
    await sharp(inputPath)
      .resize(256, 256)
      .png()
      .toFile(pngPath);

    // Convert PNG to ICO
    const buf = await pngToIco(pngPath);
    fs.writeFileSync(icoPath, buf);

    console.log('Icon successfully created at', icoPath);
  } catch (err) {
    console.error('Error generating icon:', err);
  }
}

makeIcon();
