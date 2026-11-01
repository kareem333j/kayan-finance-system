import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import fs from 'fs';
import path from 'path';

async function makeIcon() {
  try {
    const customPng = path.resolve('payroll&hr-system-icon.png');
    const inputPath = fs.existsSync(customPng) ? customPng : path.resolve('assets/brand/logo.svg');
    const pngPath = path.resolve('assets/brand/icon.png');
    const icoPath = path.resolve('assets/brand/icon.ico');
    const jpegPath = path.resolve('assets/brand/icon.jpeg');

    // Convert PNG to 512x512 trimmed PNG
    await sharp(inputPath)
      .trim()
      .resize(512, 512, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(pngPath);

    await sharp(inputPath)
      .trim()
      .resize(512, 512, { fit: 'contain', background: { r: 28, g: 42, b: 56, alpha: 1 } })
      .jpeg({ quality: 95 })
      .toFile(jpegPath);

    // Multi-resolution ICO (16, 24, 32, 48, 64, 128, 256)
    const sizes = [16, 24, 32, 48, 64, 128, 256];
    const tmpFiles = [];
    for (const s of sizes) {
      const tmp = path.resolve(`tmp_ico_${s}.png`);
      await sharp(inputPath)
        .trim()
        .resize(s, s, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(tmp);
      tmpFiles.push(tmp);
    }

    const buf = await pngToIco(tmpFiles);
    fs.writeFileSync(icoPath, buf);
    fs.writeFileSync(path.resolve('payroll&hr-system-icon.ico'), buf);
    for (const f of tmpFiles) fs.unlinkSync(f);

    console.log('Icon successfully created at', icoPath);
  } catch (err) {
    console.error('Error generating icon:', err);
    process.exitCode = 1;
  }
}

makeIcon();

