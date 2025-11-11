const dicomParser = require('dicom-parser');
const dicomCodec = require('@cornerstonejs/dicom-codec');
const dcmjs = require('dcmjs');
const { PNG } = require('pngjs');
const jpeg = require('jpeg-js');

const NATIVE_LITTLE_ENDIAN_SYNTAXES = new Set([
  '1.2.840.10008.1.2',
  '1.2.840.10008.1.2.1',
  '1.2.840.10008.1.2.1.99'
]);

const KNOWN_COMPRESSED_SYNTAXES = [
  '1.2.840.10008.1.2.4.50', // JPEG Baseline (Process 1)
  '1.2.840.10008.1.2.4.51', // JPEG Extended (Process 2 & 4)
  '1.2.840.10008.1.2.4.57', // JPEG Lossless, Nonhierarchical (Process 14)
  '1.2.840.10008.1.2.4.70', // JPEG Lossless, Nonhierarchical, First Order Prediction (Process 14 [Selection Value 1])
  '1.2.840.10008.1.2.4.80', // JPEG-LS Lossless
  '1.2.840.10008.1.2.4.81', // JPEG-LS Near-lossless
  '1.2.840.10008.1.2.4.90', // JPEG 2000 Image Compression (Lossless Only)
  '1.2.840.10008.1.2.4.91', // JPEG 2000 Image Compression
  '1.2.840.10008.1.2.4.201', // HTJ2K lossless
  '1.2.840.10008.1.2.4.202',
  '1.2.840.10008.1.2.4.203',
  '1.2.840.10008.1.2.5' // RLE Lossless
];

const SUPPORTED_FORMATS = new Set(['png', 'jpg', 'jpeg']);

async function convertDicomToImage(buffer, options = {}) {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new Error('Uploaded file is missing or unreadable.');
  }

  const format = normalizeFormat(options.format);
  const frameIndex = Number.isInteger(options.frame) ? options.frame : parseInt(options.frame || '0', 10) || 0;
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
  const photometricInterpretation =
    (dataSet.string('x00280004') || 'MONOCHROME2').toUpperCase();
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
    signed: pixelRepresentation === 1
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
}

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
    const fallback = await decodeWithFallbackCodecs(frame, pixelInfo, [transferSyntax, guess, ...KNOWN_COMPRESSED_SYNTAXES]);
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
    console.error('[dicomConverter] codec fallback failed', lastError);
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

module.exports = {
  convertDicomToImage
};
