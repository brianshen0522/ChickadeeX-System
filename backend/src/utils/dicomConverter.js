const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dicomParser = require('dicom-parser');
const dcmjs = require('dcmjs');
const { logger } = require('./logger');

/**
 * Convert DICOM file to JPEG format for downstream usage (LLM attachments, thumbnails, etc.)
 * @param {string} dicomPath - Path to the DICOM file
 * @param {string} outputDir - Directory to save the converted image
 * @param {string} baseFileName - Base filename without extension
 * @returns {Promise<string>} - Path to the converted image
 */
const convertDicomToImage = async (dicomPath, outputDir, baseFileName) => {
  try {
    const outputPath = path.join(outputDir, `${baseFileName}_converted.jpg`);
    const dicomBuffer = fs.readFileSync(dicomPath);

    try {
      const dataSet = dicomParser.parseDicom(dicomBuffer);
      const pixelElement = dataSet.elements.x7fe00010;

      if (!pixelElement) {
        throw new Error('Pixel data element (7FE0,0010) missing');
      }

      if (pixelElement.fragments || pixelElement.basicOffsetTable) {
        throw new Error('Compressed (encapsulated) pixel data not supported');
      }

      const rows = dataSet.uint16('x00280010');
      const columns = dataSet.uint16('x00280011');
      const samplesPerPixel = dataSet.uint16('x00280002') || 1;
      const photometricInterpretation = (dataSet.string('x00280004') || 'MONOCHROME2').toUpperCase();
      const planarConfiguration = dataSet.intString('x00280006') || 0;
      const bitsAllocated = dataSet.uint16('x00280100') || 8;
      const bitsStored = dataSet.uint16('x00280101') || bitsAllocated;
      const pixelRepresentation = dataSet.uint16('x00280103') || 0;
      const numberOfFrames = parseInt(dataSet.string('x00280008') || '1', 10) || 1;
      const rescaleIntercept = parseFloat((dataSet.string('x00281052') || '0').split('\\')[0]) || 0;
      const rescaleSlope = parseFloat((dataSet.string('x00281053') || '1').split('\\')[0]) || 1;

      const parseFloatValue = (input) => {
        if (!input) return null;
        const value = parseFloat(String(input).split('\\')[0]);
        return Number.isFinite(value) ? value : null;
      };

      const windowCenter = parseFloatValue(dataSet.string('x00281050'));
      const windowWidth = parseFloatValue(dataSet.string('x00281051'));

      if (!rows || !columns) {
        throw new Error('Invalid image dimensions');
      }

      const bytesPerSample = bitsAllocated / 8;
      const valuesPerFrame = rows * columns * samplesPerPixel;
      const expectedFrameBytes = valuesPerFrame * bytesPerSample;

      if (pixelElement.length < expectedFrameBytes) {
        throw new Error('Pixel buffer shorter than expected for first frame');
      }

      const frameBuffer = dicomBuffer.slice(pixelElement.dataOffset, pixelElement.dataOffset + expectedFrameBytes);

      let pixelArray;
      if (bitsAllocated === 16) {
        pixelArray = pixelRepresentation === 0
          ? new Uint16Array(frameBuffer.buffer, frameBuffer.byteOffset, expectedFrameBytes / 2)
          : new Int16Array(frameBuffer.buffer, frameBuffer.byteOffset, expectedFrameBytes / 2);
      } else if (bitsAllocated === 8) {
        pixelArray = new Uint8Array(frameBuffer.buffer, frameBuffer.byteOffset, expectedFrameBytes);
      } else {
        throw new Error(`Unsupported BitsAllocated value (${bitsAllocated})`);
      }

      const usableArray = pixelArray.length > valuesPerFrame ? pixelArray.subarray(0, valuesPerFrame) : pixelArray;
      const outputBuffer = Buffer.alloc(rows * columns * 3);

      if (samplesPerPixel === 1) {
        const processedValues = new Float32Array(rows * columns);
        let min = Number.POSITIVE_INFINITY;
        let max = Number.NEGATIVE_INFINITY;

        for (let i = 0; i < rows * columns; i++) {
          const value = usableArray[i] * rescaleSlope + rescaleIntercept;
          processedValues[i] = value;
          if (value < min) min = value;
          if (value > max) max = value;
        }

        const hasWindow = windowCenter != null && windowWidth != null && windowWidth > 0;
        const lowerBound = hasWindow ? windowCenter - windowWidth / 2 : min;
        const upperBound = hasWindow ? windowCenter + windowWidth / 2 : max;
        const range = upperBound - lowerBound || 1;
        const invert = photometricInterpretation === 'MONOCHROME1';

        for (let i = 0; i < rows * columns; i++) {
          let normalized = (processedValues[i] - lowerBound) / range;
          normalized = Math.min(1, Math.max(0, normalized));
          const grey = invert ? Math.round((1 - normalized) * 255) : Math.round(normalized * 255);
          const offset = i * 3;
          outputBuffer[offset] = grey;
          outputBuffer[offset + 1] = grey;
          outputBuffer[offset + 2] = grey;
        }
      } else if (samplesPerPixel === 3) {
        const maxSampleValue = Math.pow(2, bitsStored) - 1 || 255;
        const scaleSample = (sample) => {
          const normalized = sample / maxSampleValue;
          return Math.min(255, Math.max(0, Math.round(normalized * 255)));
        };

        const pixels = rows * columns;

        if (planarConfiguration === 0) {
          for (let i = 0; i < pixels; i++) {
            const base = i * 3;
            outputBuffer[base] = scaleSample(usableArray[base]);
            outputBuffer[base + 1] = scaleSample(usableArray[base + 1]);
            outputBuffer[base + 2] = scaleSample(usableArray[base + 2]);
          }
        } else if (planarConfiguration === 1) {
          const planeSize = pixels;
          for (let i = 0; i < pixels; i++) {
            outputBuffer[i * 3] = scaleSample(usableArray[i]);
            outputBuffer[i * 3 + 1] = scaleSample(usableArray[i + planeSize]);
            outputBuffer[i * 3 + 2] = scaleSample(usableArray[i + planeSize * 2]);
          }
        } else {
          throw new Error(`Unsupported planar configuration (${planarConfiguration})`);
        }
      } else {
        throw new Error(`Unsupported SamplesPerPixel value (${samplesPerPixel})`);
      }

      await sharp(outputBuffer, {
        raw: {
          width: columns,
          height: rows,
          channels: 3
        }
      })
        .jpeg({ quality: 90 })
        .toFile(outputPath);

      logger.info(`DICOM successfully converted to JPEG: ${outputPath} (frames: ${numberOfFrames})`);
      return outputPath;
    } catch (dicomError) {
      logger.warn(`DICOM to JPEG conversion failed, generating placeholder: ${dicomError.message}`);

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
      return outputPath;
    }
  } catch (error) {
    logger.error('DICOM conversion completely failed:', error);
    throw new Error(`Failed to convert DICOM file: ${error.message}`);
  }
};

/**
 * Get metadata from DICOM file
 * @param {string} dicomPath - Path to the DICOM file
 * @returns {Promise<object>} - DICOM metadata
 */
const getDicomMetadata = async (dicomPath) => {
  try {
    const stats = fs.statSync(dicomPath);

    try {
      // Parse DICOM file to extract metadata
      const dicomBuffer = fs.readFileSync(dicomPath);
      const dataSet = dcmjs.data.DicomMessage.readFile(dicomBuffer);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dataSet.dict);

      return {
        patientId: dataset.PatientID || 'ANON',
        patientName: dataset.PatientName?.Alphabetic || 'Anonymous',
        studyDate: dataset.StudyDate || new Date().toISOString().split('T')[0].replace(/-/g, ''),
        studyTime: dataset.StudyTime || '',
        modality: dataset.Modality || 'OT',
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

      // Fallback metadata when parsing fails
      return {
        patientId: 'ANON',
        patientName: 'Anonymous',
        studyDate: new Date().toISOString().split('T')[0].replace(/-/g, ''),
        studyTime: '',
        modality: 'OT',
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

module.exports = {
  convertDicomToImage,
  getDicomMetadata
};
