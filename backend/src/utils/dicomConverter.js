const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dicomParser = require('dicom-parser');
const dicomCodec = require('@cornerstonejs/dicom-codec');
const dcmjs = require('dcmjs');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');
const { logger } = require('./logger');

const fsp = fs.promises;

const NATIVE_LITTLE_ENDIAN_SYNTAXES = new Set([
  '1.2.840.10008.1.2',
  '1.2.840.10008.1.2.1',
  '1.2.840.10008.1.2.1.99'
]);

const KNOWN_COMPRESSED_SYNTAXES = new Set([
  '1.2.840.10008.1.2.4.50', // JPEG Baseline (Process 1)
  '1.2.840.10008.1.2.4.51', // JPEG Extended (Process 2 & 4)
  '1.2.840.10008.1.2.4.57', // JPEG Lossless
  '1.2.840.10008.1.2.4.70', // JPEG Lossless First Order Prediction
  '1.2.840.10008.1.2.4.80', // JPEG-LS Lossless
  '1.2.840.10008.1.2.4.81', // JPEG-LS Near-lossless
  '1.2.840.10008.1.2.4.90', // JPEG 2000 Lossless Only
  '1.2.840.10008.1.2.4.91', // JPEG 2000
  '1.2.840.10008.1.2.4.201', // HTJ2K Lossless
  '1.2.840.10008.1.2.4.202',
  '1.2.840.10008.1.2.4.203',
  '1.2.840.10008.1.2.5' // RLE Lossless
]);

const SUPPORTED_FORMATS = new Set(['png', 'jpg', 'jpeg']);

const DICOM_MIME_TYPES = new Set([
  'application/dicom',
  'application/x-dicom',
  'application/dicom+json',
  'application/dicom+xml'
]);

const KNOWN_DICOM_EXTENSIONS = new Set([
  '.dcm',
  '.dicom',
  '.dic',
  '.dicm',
  '.dicon',
  '.acr',
  '.img',
  '.ima',
  '.dcm30',
  ''
]);

const DICOM_PREFIX = 'DICM';
const DICOM_PREAMBLE_OFFSET = 128;
const MAX_PROBE_BYTES = 4096;
const MAX_FULL_PARSE_BYTES = 25 * 1024 * 1024;

const CONVERSION_WARN_THRESHOLD_MS = Number(process.env.DICOM_CONVERSION_WARN_MS || 7000);

let codecInitPromise = null;
const ensureDicomCodecReady = async () => {
  if (typeof dicomCodec?.initialize !== 'function') {
    return;
  }
  if (!codecInitPromise) {
    codecInitPromise = dicomCodec.initialize().catch((error) => {
      codecInitPromise = null;
      logger.warn('Failed to initialize DICOM codecs', { error: error.message });
      throw error;
    });
  }
  return codecInitPromise;
};

const convertDicomToImage = async (dicomPath, outputDir, baseFileName, options = {}) => {
  const requestedFormat = options.format || 'jpg';
  const targetFormat = SUPPORTED_FORMATS.has(requestedFormat?.toLowerCase())
    ? requestedFormat
    : 'jpg';
  const conversionStarted = Date.now();

  try {
    const dicomBuffer = await fsp.readFile(dicomPath);
    const conversion = await convertDicomBuffer(dicomBuffer, {
      format: targetFormat,
      frame: options.frame
    });

    const extension = conversion.contentType === 'image/png' ? 'png' : 'jpg';
    const outputPath = path.join(outputDir, `${baseFileName}_converted.${extension}`);
    await fsp.writeFile(outputPath, conversion.imageBuffer);

    const durationMs = Date.now() - conversionStarted;
    const slowConversion = durationMs > CONVERSION_WARN_THRESHOLD_MS;
    logger[slowConversion ? 'warn' : 'info'](slowConversion ? 'Slow DICOM conversion' : 'DICOM converted to display image', {
      dicomPath,
      outputPath,
      transferSyntax: conversion.details.transferSyntax,
      photometricInterpretation: conversion.details.photometricInterpretation,
      frame: conversion.details.frame,
      rows: conversion.details.height,
      columns: conversion.details.width,
      durationMs
    });

    return outputPath;
  } catch (error) {
    logger.error('DICOM conversion failed, generating placeholder', { dicomPath, error: error.message });
    const fallbackPath = path.join(outputDir, `${baseFileName}_converted.jpg`);
    await generatePlaceholderImage(fallbackPath, baseFileName);
    return fallbackPath;
  }
};

const convertDicomBuffer = async (buffer, options = {}) => {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Uploaded file is missing or unreadable.');
  }

  await ensureDicomCodecReady().catch((error) => {
    logger.warn('Codec initialization skipped due to error', { error: error.message });
  });

  const format = normalizeFormat(options.format);
  const frameIndex = Number.isInteger(options.frame)
    ? options.frame
    : parseInt(options.frame || '0', 10) || 0;

  if (frameIndex < 0) {
    throw new Error('Frame index must be zero or positive.');
  }

  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  const byteArray = new Uint8Array(arrayBuffer);

  const dataSet = dicomParser.parseDicom(byteArray);
  const pixelElement = dataSet.elements.x7fe00010;
  if (!pixelElement) {
    throw new Error('No Pixel Data element (7FE0,0010) found in the file.');
  }

  const meta = extractNaturalizedMetadata(arrayBuffer);
  const transferSyntax =
    dataSet.string('x00020010') ||
    meta.TransferSyntaxUID ||
    inferTransferSyntax(dataSet, pixelElement);

  if (!transferSyntax) {
    throw new Error('Unable to determine Transfer Syntax UID for this DICOM object.');
  }

  const rows = dataSet.uint16('x00280010');
  const columns = dataSet.uint16('x00280011');
  const bitsAllocated = dataSet.uint16('x00280100');
  const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
  const samplesPerPixel = dataSet.uint16('x00280002') || 1;
  const pixelRepresentation = dataSet.uint16('x00280103') || 0;
  const planarConfiguration = samplesPerPixel > 1 ? dataSet.uint16('x00280006') || 0 : 0;
  const numberOfFrames = dataSet.intString('x00280008') || 1;
  const photometricInterpretation = (dataSet.string('x00280004') || 'MONOCHROME2').toUpperCase();
  const rescaleSlope = getNumericValue(dataSet, 'x00281053') ?? 1;
  const rescaleIntercept = getNumericValue(dataSet, 'x00281052') ?? 0;
  const windowCenter = getNumericValue(dataSet, 'x00281050');
  const windowWidth = getNumericValue(dataSet, 'x00281051');

  validateImageAttributes({
    rows,
    columns,
    bitsAllocated,
    samplesPerPixel,
    numberOfFrames,
    frameIndex
  });

  const pixelInfo = {
    rows,
    columns,
    bitsAllocated,
    bitsStored,
    samplesPerPixel,
    signed: pixelRepresentation === 1,
    planarConfiguration,
    pixelRepresentation
  };

  const {
    pixelData,
    imageInfo,
    transferSyntax: resolvedTransferSyntax
  } = await decodePixelData({
    dataSet,
    pixelElement,
    transferSyntax,
    frameIndex,
    pixelInfo
  });

  const displayPixels = buildDisplayPixels({
    pixelData,
    imageInfo,
    photometricInterpretation,
    planarConfiguration,
    rescaleSlope,
    rescaleIntercept,
    windowCenter,
    windowWidth
  });

  const { buffer: outputBuffer, contentType } = await encodeImage(displayPixels, {
    width: columns,
    height: rows,
    samplesPerPixel: imageInfo.samplesPerPixel,
    format
  });

  const summary = {
    patientName: meta.PatientName,
    studyDescription: meta.StudyDescription,
    seriesDescription: meta.SeriesDescription,
    modality: meta.Modality,
    transferSyntax: resolvedTransferSyntax || transferSyntax,
    photometricInterpretation,
    numberOfFrames
  };

  return {
    imageBuffer: outputBuffer,
    contentType,
    details: {
      ...summary,
      frame: frameIndex,
      width: columns,
      height: rows,
      format
    }
  };
};

function normalizeFormat(inputFormat) {
  const requested = (inputFormat || 'png').toLowerCase();
  if (!SUPPORTED_FORMATS.has(requested)) {
    throw new Error(`Unsupported output format "${inputFormat}". Use png or jpg.`);
  }
  return requested === 'jpeg' ? 'jpg' : requested;
}

function extractNaturalizedMetadata(arrayBuffer) {
  try {
    const dicomData = dcmjs.data.DicomMessage.readFile(arrayBuffer);
    const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.dict || {});
    const meta = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dicomData.meta || {});
    return { ...meta, ...dataset };
  } catch (error) {
    return {};
  }
}

function validateImageAttributes({
  rows,
  columns,
  bitsAllocated,
  samplesPerPixel,
  numberOfFrames,
  frameIndex
}) {
  if (!rows || !columns) {
    throw new Error('Missing Rows (0028,0010) or Columns (0028,0011) in DICOM file.');
  }
  if (!bitsAllocated || bitsAllocated % 8 !== 0) {
    throw new Error('Unsupported BitsAllocated. Only whole-byte pixels are supported.');
  }
  if (samplesPerPixel > 4) {
    throw new Error(`SamplesPerPixel=${samplesPerPixel} not supported.`);
  }
  if (frameIndex >= numberOfFrames) {
    throw new Error(`Requested frame ${frameIndex} but file only contains ${numberOfFrames} frame(s).`);
  }
}

async function decodePixelData({
  dataSet,
  pixelElement,
  transferSyntax,
  frameIndex,
  pixelInfo
}) {
  const encapsulated = Boolean(pixelElement.encapsulatedPixelData);
  const hasCodec = transferSyntax && dicomCodec.hasCodec(transferSyntax);

  if (encapsulated) {
    const frame = readEncapsulatedFrame(dataSet, pixelElement, frameIndex);
    if (hasCodec) {
      return decodeWithCodec(frame, pixelInfo, transferSyntax);
    }

    const guess = guessTransferSyntaxFromFrame(frame);
    const fallback = await decodeWithFallbackCodecs(frame, pixelInfo, [
      transferSyntax,
      guess,
      ...KNOWN_COMPRESSED_SYNTAXES
    ]);
    if (fallback) {
      return fallback;
    }

    throw new Error('Unable to decode encapsulated pixel data with available codecs.');
  }

  const nativeFrame = extractNativeFrameBytes(dataSet, pixelElement, frameIndex, pixelInfo);

  if (hasCodec) {
    return decodeWithCodec(nativeFrame, pixelInfo, transferSyntax);
  }

  if (!transferSyntax || NATIVE_LITTLE_ENDIAN_SYNTAXES.has(transferSyntax)) {
    return decodeLittleEndian(nativeFrame, pixelInfo, transferSyntax);
  }

  throw new Error(`Transfer Syntax ${transferSyntax || 'unknown'} is not supported by available codecs.`);
}

function readEncapsulatedFrame(dataSet, pixelElement, frameIndex) {
  let basicOffsetTable = pixelElement.basicOffsetTable;
  const fragments = pixelElement.fragments;
  if (!basicOffsetTable || basicOffsetTable.length === 0) {
    basicOffsetTable = dicomParser.createJPEGBasicOffsetTable(
      dataSet,
      pixelElement,
      fragments
    );
  }

  return dicomParser.readEncapsulatedImageFrame(
    dataSet,
    pixelElement,
    frameIndex,
    basicOffsetTable,
    fragments
  );
}

function extractNativeFrameBytes(dataSet, pixelElement, frameIndex, pixelInfo) {
  const bytesPerSample = pixelInfo.bitsAllocated / 8;
  const samplesPerFrame = pixelInfo.rows * pixelInfo.columns * pixelInfo.samplesPerPixel;
  const frameLength = samplesPerFrame * bytesPerSample;
  const start = pixelElement.dataOffset + frameIndex * frameLength;
  const end = start + frameLength;

  if (end > pixelElement.dataOffset + pixelElement.length) {
    throw new Error('Pixel data is truncated or inconsistent with Rows/Columns.');
  }

  const byteArray = dataSet.byteArray.subarray(start, end);
  return new Uint8Array(
    byteArray.buffer.slice(byteArray.byteOffset, byteArray.byteOffset + byteArray.byteLength)
  );
}

async function decodeWithCodec(frame, pixelInfo, transferSyntax) {
  if (!transferSyntax) {
    throw new Error('Missing transfer syntax for codec decoding.');
  }
  const decoded = await dicomCodec.decode(frame, pixelInfo, transferSyntax);
  const pixels = dicomCodec.getPixelData(decoded.imageFrame, decoded.imageInfo, transferSyntax);
  return {
    pixelData: pixels,
    imageInfo: mergeImageInfo(pixelInfo, decoded.imageInfo),
    transferSyntax
  };
}

async function decodeWithFallbackCodecs(frame, pixelInfo, candidates = []) {
  const uniqueCandidates = Array.from(new Set((candidates || []).filter(Boolean)));
  let lastError;
  for (const candidate of uniqueCandidates) {
    if (!dicomCodec.hasCodec(candidate)) {
      continue;
    }
    try {
      return await decodeWithCodec(frame, pixelInfo, candidate);
    } catch (error) {
      lastError = error;
    }
  }
  if (lastError) {
    logger.warn('Codec fallback failed', { error: lastError.message });
  }
  return null;
}

function decodeLittleEndian(nativeFrame, pixelInfo, transferSyntax) {
  const bufferCopy = nativeFrame.buffer.slice(
    nativeFrame.byteOffset,
    nativeFrame.byteOffset + nativeFrame.byteLength
  );

  const bytesPerSample = pixelInfo.bitsAllocated / 8;
  let typedArray;
  if (bytesPerSample === 1) {
    typedArray = pixelInfo.signed ? new Int8Array(bufferCopy) : new Uint8Array(bufferCopy);
  } else if (bytesPerSample === 2) {
    typedArray = pixelInfo.signed ? new Int16Array(bufferCopy) : new Uint16Array(bufferCopy);
  } else if (bytesPerSample === 4 && pixelInfo.bitsAllocated === 32) {
    typedArray = new Float32Array(bufferCopy);
  } else {
    typedArray = new Uint8Array(bufferCopy);
  }

  return {
    pixelData: typedArray,
    imageInfo: pixelInfo,
    transferSyntax: transferSyntax || '1.2.840.10008.1.2'
  };
}

function guessTransferSyntaxFromFrame(frame) {
  if (!frame || frame.length < 2) {
    return null;
  }
  const first = frame[0];
  const second = frame[1];
  if (first === 0xff && second === 0x4f) {
    return '1.2.840.10008.1.2.4.90';
  }
  if (first === 0xff && second === 0xd8) {
    return '1.2.840.10008.1.2.4.50';
  }
  if (
    frame.length >= 4 &&
    frame[0] === 0x00 &&
    frame[1] === 0x00 &&
    frame[2] === 0x00 &&
    frame[3] === 0x01
  ) {
    return '1.2.840.10008.1.2.5';
  }
  return null;
}

function buildDisplayPixels({
  pixelData,
  imageInfo,
  photometricInterpretation,
  planarConfiguration,
  rescaleSlope,
  rescaleIntercept,
  windowCenter,
  windowWidth
}) {
  if (imageInfo.samplesPerPixel === 1) {
    const rescaled = applyLinearRescale(pixelData, rescaleSlope, rescaleIntercept);
    const normalized =
      Number.isFinite(windowCenter) && Number.isFinite(windowWidth) && windowWidth > 0
        ? applyWindowLevel(rescaled, windowCenter, windowWidth)
        : normalizeToUint8(rescaled);
    if (photometricInterpretation === 'MONOCHROME1') {
      return invertLuminance(normalized);
    }
    return normalized;
  }

  if (imageInfo.samplesPerPixel === 3) {
    const interleaved = ensureInterleaved(pixelData, planarConfiguration, imageInfo.samplesPerPixel);
    const colorBytes = castColorSamples(interleaved, imageInfo.bitsAllocated);
    return convertPhotometricToRgb(colorBytes, photometricInterpretation);
  }

  throw new Error(`SamplesPerPixel=${imageInfo.samplesPerPixel} not implemented for display.`);
}

function normalizeToUint8(pixelData) {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  const length = pixelData.length;

  for (let i = 0; i < length; i += 1) {
    const value = pixelData[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  if (!isFinite(min) || !isFinite(max)) {
    return new Uint8Array(length);
  }

  if (min === max) {
    return new Uint8Array(length).fill(0);
  }

  const range = max - min;
  const output = new Uint8Array(length);

  for (let i = 0; i < length; i += 1) {
    const value = pixelData[i];
    output[i] = Math.max(
      0,
      Math.min(255, Math.round(((value - min) / range) * 255))
    );
  }

  return output;
}

function invertLuminance(pixelBytes) {
  const inverted = new Uint8Array(pixelBytes.length);
  for (let i = 0; i < pixelBytes.length; i += 1) {
    inverted[i] = 255 - pixelBytes[i];
  }
  return inverted;
}

function ensureInterleaved(pixelData, planarConfiguration, samplesPerPixel) {
  if (planarConfiguration !== 1) {
    return pixelData;
  }

  const planeLength = pixelData.length / samplesPerPixel;
  const interleaved = new pixelData.constructor(pixelData.length);

  for (let i = 0; i < planeLength; i += 1) {
    for (let c = 0; c < samplesPerPixel; c += 1) {
      interleaved[i * samplesPerPixel + c] = pixelData[c * planeLength + i];
    }
  }

  return interleaved;
}

function castColorSamples(pixelData, bitsAllocated) {
  if (bitsAllocated <= 8 && pixelData instanceof Uint8Array) {
    return pixelData;
  }

  const output = new Uint8Array(pixelData.length);
  const maxValue = (1 << bitsAllocated) - 1;

  for (let i = 0; i < pixelData.length; i += 1) {
    const value = pixelData[i];
    output[i] = Math.max(0, Math.min(255, Math.round((value / maxValue) * 255)));
  }

  return output;
}

function convertPhotometricToRgb(pixelBytes, photometricInterpretation) {
  if (photometricInterpretation === 'RGB') {
    return pixelBytes;
  }

  if (photometricInterpretation === 'YBR_FULL' || photometricInterpretation === 'YBR_FULL_422') {
    const converted = new Uint8Array(pixelBytes.length);
    for (let i = 0; i < pixelBytes.length; i += 3) {
      const y = pixelBytes[i];
      const cb = pixelBytes[i + 1] - 128;
      const cr = pixelBytes[i + 2] - 128;
      const r = clamp255(y + 1.402 * cr);
      const g = clamp255(y - 0.344136 * cb - 0.714136 * cr);
      const b = clamp255(y + 1.772 * cb);
      converted[i] = r;
      converted[i + 1] = g;
      converted[i + 2] = b;
    }
    return converted;
  }

  throw new Error(`PhotometricInterpretation ${photometricInterpretation} is not supported for color images.`);
}

function clamp255(value) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function applyLinearRescale(pixelData, slope = 1, intercept = 0) {
  if (slope === 1 && intercept === 0) {
    return pixelData;
  }
  const length = pixelData.length;
  const output = new Float32Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = pixelData[i] * slope + intercept;
  }
  return output;
}

function applyWindowLevel(pixelData, center, width) {
  const ww = Math.max(width, 1);
  const wc = center;
  const min = wc - ww / 2;
  const max = wc + ww / 2;
  const output = new Uint8Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i += 1) {
    const value = pixelData[i];
    if (value <= min) {
      output[i] = 0;
    } else if (value >= max) {
      output[i] = 255;
    } else {
      output[i] = clamp255(((value - min) / ww) * 255);
    }
  }
  return output;
}

async function encodeImage(pixelBytes, { width, height, samplesPerPixel, format }) {
  const channels = samplesPerPixel === 1 ? 1 : 3;
  try {
    const pipeline = sharp(Buffer.from(pixelBytes), {
      raw: {
        width,
        height,
        channels
      }
    });

    if (channels === 1) {
      pipeline.toColourspace('b-w');
    }

    if (format === 'png') {
      const buffer = await pipeline.png({ compressionLevel: 6 }).toBuffer();
      return {
        buffer,
        contentType: 'image/png'
      };
    }

    const buffer = await pipeline.jpeg({ quality: 90 }).toBuffer();
    return {
      buffer,
      contentType: 'image/jpeg'
    };
  } catch (error) {
    logger.warn('Sharp encoding failed, falling back to JS codecs', { error: error.message });
    return encodeImageFallback(pixelBytes, { width, height, samplesPerPixel, format });
  }
}

async function encodeImageFallback(pixelBytes, { width, height, samplesPerPixel, format }) {
  if (format === 'png') {
    const png = new PNG({
      width,
      height,
      colorType: samplesPerPixel === 1 ? 0 : 2,
      inputColorType: samplesPerPixel === 1 ? 0 : 2,
      bitDepth: 8
    });

    png.data = Buffer.from(pixelBytes);

    const chunks = [];
    return new Promise((resolve, reject) => {
      png
        .pack()
        .on('data', (chunk) => chunks.push(chunk))
        .on('error', reject)
        .on('end', () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType: 'image/png'
          });
        });
    });
  }

  const rgba = convertToRgba(pixelBytes, width, height, samplesPerPixel);
  const jpegImage = jpeg.encode(
    {
      data: rgba,
      width,
      height
    },
    90
  );

  return {
    buffer: Buffer.from(jpegImage.data),
    contentType: 'image/jpeg'
  };
}

function convertToRgba(pixelBytes, width, height, samplesPerPixel) {
  const rgba = Buffer.alloc(width * height * 4);

  if (samplesPerPixel === 1) {
    for (let i = 0; i < width * height; i += 1) {
      const value = pixelBytes[i];
      rgba[i * 4] = value;
      rgba[i * 4 + 1] = value;
      rgba[i * 4 + 2] = value;
      rgba[i * 4 + 3] = 255;
    }
    return rgba;
  }

  for (let i = 0; i < width * height; i += 1) {
    const base = i * samplesPerPixel;
    rgba[i * 4] = pixelBytes[base];
    rgba[i * 4 + 1] = pixelBytes[base + 1];
    rgba[i * 4 + 2] = pixelBytes[base + 2];
    rgba[i * 4 + 3] = 255;
  }

  return rgba;
}

function inferTransferSyntax(dataSet, pixelElement) {
  if (!pixelElement) {
    return null;
  }

  if (pixelElement.encapsulatedPixelData) {
    try {
      const frame = readEncapsulatedFrame(dataSet, pixelElement, 0);
      return guessTransferSyntaxFromFrame(frame);
    } catch (error) {
      return null;
    }
  }

  return '1.2.840.10008.1.2';
}

function mergeImageInfo(original, decodedInfo = {}) {
  return {
    ...original,
    ...decodedInfo
  };
}

function getNumericValue(dataSet, tag) {
  const str = dataSet.string(tag);
  if (str === undefined || str === null) {
    return undefined;
  }
  const first = String(str).split('\\')[0];
  const num = Number(first);
  return Number.isFinite(num) ? num : undefined;
}

async function generatePlaceholderImage(outputPath, baseFileName) {
  const placeholderSvg = `
    <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#0f172a"/>
          <stop offset="100%" stop-color="#1e293b"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>
      <text x="50%" y="42%" text-anchor="middle" fill="#e2e8f0" font-family="Arial" font-size="22" font-weight="bold">
        DICOM PREVIEW UNAVAILABLE
      </text>
      <text x="50%" y="56%" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="14">
        ${baseFileName.substring(0, 28)}${baseFileName.length > 28 ? '…' : ''}
      </text>
      <text x="50%" y="68%" text-anchor="middle" fill="#64748b" font-family="Arial" font-size="12">
        Original study retained for diagnostic viewing
      </text>
    </svg>
  `;

  await sharp(Buffer.from(placeholderSvg))
    .resize(512, 512, { fit: 'cover' })
    .jpeg({ quality: 85 })
    .toFile(outputPath);

  logger.info(`DICOM placeholder JPEG created: ${outputPath}`);
}

const extractDicomString = (value) => {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      const extracted = extractDicomString(entry);
      if (extracted) {
        return extracted;
      }
    }
    return undefined;
  }
  if (typeof value === 'object') {
    if (typeof value.Alphabetic === 'string') {
      const trimmed = value.Alphabetic.trim();
      if (trimmed.length) {
        return trimmed;
      }
    }
    if (Array.isArray(value.Value)) {
      return extractDicomString(value.Value);
    }
    if (typeof value.value === 'string') {
      const trimmed = value.value.trim();
      if (trimmed.length) {
        return trimmed;
      }
    }
  }
  return undefined;
};

const resolveDicomTagString = (dataset, keys = []) => {
  if (!dataset || !Array.isArray(keys)) {
    return undefined;
  }

  for (const key of keys) {
    if (!key) {
      continue;
    }
    const value = dataset[key];
    const extracted = extractDicomString(value);
    if (extracted) {
      return extracted;
    }
  }

  return undefined;
};

const formatModalityLabel = (rawValue) => {
  if (!rawValue) {
    return null;
  }
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return null;
  }
  const bracketMatch = trimmed.match(/\[(.*?)\]/);
  if (bracketMatch && bracketMatch[1]) {
    const bracketValue = bracketMatch[1].trim();
    if (bracketValue) {
      return bracketValue;
    }
  }
  return trimmed;
};

const readDicomTagValue = async (dicomPath, tag) => {
  const normalizedTag = (() => {
    if (!tag) return null;
    if (tag.startsWith('x')) return tag;
    const hex = tag.replace(/[^0-9a-fA-F]/g, '');
    if (!hex) return null;
    return `x${hex.padStart(8, '0')}`;
  })();

  if (!normalizedTag) {
    return undefined;
  }

  try {
    const fileBuffer = await fsp.readFile(dicomPath);
    const byteArray = new Uint8Array(
      fileBuffer.buffer,
      fileBuffer.byteOffset,
      fileBuffer.byteLength
    );
    const data = dicomParser.parseDicom(byteArray);
    return data.string(normalizedTag) || data.string(normalizedTag.replace(/^x/, ''));
  } catch (error) {
    logger.debug?.('Failed to read DICOM tag with fallback parser', {
      dicomPath,
      tag: normalizedTag,
      error: error.message
    });
    return undefined;
  }
};

const getDicomMetadata = async (dicomPath) => {
  try {
    const stats = fs.statSync(dicomPath);

    try {
      const dicomBuffer = fs.readFileSync(dicomPath);
      const dataSet = dcmjs.data.DicomMessage.readFile(dicomBuffer);
      const naturalized = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dataSet.dict);
      const dataset = dcmjs.data.DicomMetaDictionary.namifyDataset(naturalized);

      let rawModality = dataSet.string('x00080060') || dataSet.string('00080060');
      if (!rawModality) {
        rawModality = resolveDicomTagString(dataset, [
          'Modality',
          'modality',
          '00080060',
          'x00080060',
          '0x00080060',
          '0008,0060',
          '(0008,0060)'
        ]);
      }
      if (!rawModality) {
        rawModality = await readDicomTagValue(dicomPath, 'x00080060');
      }

      const modality = formatModalityLabel(rawModality) || rawModality || 'OT';

      return {
        patientId: dataset.PatientID || 'ANON',
        patientName: dataset.PatientName?.Alphabetic || 'Anonymous',
        studyDate: dataset.StudyDate || new Date().toISOString().split('T')[0].replace(/-/g, ''),
        studyTime: dataset.StudyTime || '',
        modality,
        modality_raw: rawModality || null,
        studyDescription: dataset.StudyDescription || 'DICOM Study',
        seriesDescription: dataset.SeriesDescription || '',
        institutionName: dataset.InstitutionName || '',
        manufacturer: dataset.Manufacturer || '',
        rows: dataset.Rows || 0,
        columns: dataset.Columns || 0,
        imageSize: stats.size,
        sopInstanceUID: dataset.SOPInstanceUID || `1.2.276.0.7230010.3.1.4.${Date.now()}`,
        studyInstanceUID: dataset.StudyInstanceUID || `1.2.276.0.7230010.3.1.2.${Date.now()}`,
        seriesInstanceUID: dataset.SeriesInstanceUID || `1.2.276.0.7230010.3.1.3.${Date.now()}`,
        bitsAllocated: dataset.BitsAllocated || 0,
        bitsStored: dataset.BitsStored || 0,
        pixelRepresentation: dataset.PixelRepresentation || 0,
        samplesPerPixel: dataset.SamplesPerPixel || 1
      };
    } catch (dicomError) {
      logger.warn(`DICOM metadata parsing failed: ${dicomError.message}`);
      return {
        patientId: 'ANON',
        patientName: 'Anonymous',
        studyDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        studyTime: '',
        modality: 'OT',
        modality_raw: null,
        studyDescription: 'DICOM Study',
        seriesDescription: 'Uploaded DICOM',
        institutionName: '',
        manufacturer: '',
        rows: 0,
        columns: 0,
        imageSize: stats.size,
        sopInstanceUID: `1.2.276.0.7230010.3.1.4.${Date.now()}`,
        studyInstanceUID: `1.2.276.0.7230010.3.1.2.${Date.now()}`,
        seriesInstanceUID: `1.2.276.0.7230010.3.1.3.${Date.now()}`,
        bitsAllocated: 0,
        bitsStored: 0,
        pixelRepresentation: 0,
        samplesPerPixel: 1
      };
    }
  } catch (error) {
    logger.error('DICOM metadata extraction completely failed:', error);
    return {
      patientId: 'UNKNOWN',
      patientName: 'Unknown',
      studyDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      studyTime: '',
      modality: 'OT',
      modality_raw: null,
      studyDescription: 'DICOM Study',
      seriesDescription: '',
      institutionName: '',
      manufacturer: '',
      rows: 0,
      columns: 0,
      imageSize: 0,
      sopInstanceUID: `1.2.276.0.7230010.3.1.4.${Date.now()}`,
      studyInstanceUID: `1.2.276.0.7230010.3.1.2.${Date.now()}`,
      seriesInstanceUID: `1.2.276.0.7230010.3.1.3.${Date.now()}`,
      bitsAllocated: 0,
      bitsStored: 0,
      pixelRepresentation: 0,
      samplesPerPixel: 1
    };
  }
};

const detectDicomFile = async (filePath, { extension, mimeType } = {}) => {
  const normalizedExt = (extension || '').toLowerCase();
  const normalizedMime = (mimeType || '').toLowerCase();

  if (isLikelyDicomExtension(normalizedExt) || isDicomMimeType(normalizedMime)) {
    return true;
  }

  try {
    const handle = await fsp.open(filePath, 'r');
    try {
      const stats = await handle.stat();
      if (stats.size === 0) {
        return false;
      }
      const probeLength = Math.min(stats.size, MAX_PROBE_BYTES);
      const probeBuffer = Buffer.alloc(probeLength);
      await handle.read(probeBuffer, 0, probeLength, 0);

      if (probeLength >= DICOM_PREAMBLE_OFFSET + 4) {
        const prefix = probeBuffer.slice(DICOM_PREAMBLE_OFFSET, DICOM_PREAMBLE_OFFSET + 4).toString();
        if (prefix === DICOM_PREFIX) {
          return true;
        }
      }

      try {
        dicomParser.parseDicom(probeBuffer);
        return true;
      } catch (partialError) {
        if (stats.size <= MAX_FULL_PARSE_BYTES) {
          const fullBuffer = await fsp.readFile(filePath);
          try {
            dicomParser.parseDicom(fullBuffer);
            return true;
          } catch (fullParseError) {
            logger.debug?.('Full DICOM parse failed during detection', { filePath, error: fullParseError.message });
          }
        }
      }
    } finally {
      await handle.close();
    }
  } catch (error) {
    logger.warn('Failed to probe file for DICOM signature', { filePath, error: error.message });
  }

  return false;
};

const isDicomMimeType = (mimeType = '') => {
  const normalized = mimeType.toLowerCase();
  return DICOM_MIME_TYPES.has(normalized);
};

const isLikelyDicomExtension = (extension = '') => {
  const normalized = extension.toLowerCase();
  return KNOWN_DICOM_EXTENSIONS.has(normalized);
};

module.exports = {
  convertDicomToImage,
  getDicomMetadata,
  detectDicomFile,
  isDicomMimeType,
  isLikelyDicomExtension
};
