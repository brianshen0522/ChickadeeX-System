const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const dcmjs = require('dcmjs');
const { logger } = require('./logger');

/**
 * Convert DICOM file to PNG format
 * @param {string} dicomPath - Path to the DICOM file
 * @param {string} outputDir - Directory to save the converted image
 * @param {string} baseFileName - Base filename without extension
 * @returns {Promise<string>} - Path to the converted image
 */
const convertDicomToImage = async (dicomPath, outputDir, baseFileName) => {
  try {
    const outputPath = path.join(outputDir, `${baseFileName}_converted.png`);

    try {
      // Attempt to parse DICOM file with dcmjs
      const dicomBuffer = fs.readFileSync(dicomPath);
      const dataSet = dcmjs.data.DicomMessage.readFile(dicomBuffer);
      const dataset = dcmjs.data.DicomMetaDictionary.naturalizeDataset(dataSet.dict);

      // Extract pixel data if available
      if (dataset.PixelData && dataset.Rows && dataset.Columns) {
        // Basic DICOM to image conversion
        const width = dataset.Columns;
        const height = dataset.Rows;
        const pixelData = new Uint8Array(dataset.PixelData);

        // Create a simple grayscale image from pixel data
        const imageBuffer = Buffer.alloc(width * height * 3); // RGB

        for (let i = 0; i < pixelData.length && i < width * height; i++) {
          const value = pixelData[i];
          imageBuffer[i * 3] = value;     // R
          imageBuffer[i * 3 + 1] = value; // G
          imageBuffer[i * 3 + 2] = value; // B
        }

        await sharp(imageBuffer, {
          raw: {
            width: width,
            height: height,
            channels: 3
          }
        })
        .png()
        .toFile(outputPath);

        logger.info(`DICOM successfully converted to image: ${outputPath}`);
        return outputPath;

      } else {
        throw new Error('No pixel data found in DICOM file');
      }

    } catch (dicomError) {
      logger.warn(`DICOM parsing failed, creating placeholder: ${dicomError.message}`);

      // Create a placeholder image for DICOM files when parsing fails
      const placeholderSvg = `
        <svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
          <rect width="100%" height="100%" fill="#1e293b"/>
          <text x="50%" y="40%" text-anchor="middle" fill="#94a3b8" font-family="Arial" font-size="18" font-weight="bold">
            DICOM File
          </text>
          <text x="50%" y="50%" text-anchor="middle" fill="#64748b" font-family="Arial" font-size="12">
            ${baseFileName.substring(0, 20)}${baseFileName.length > 20 ? '...' : ''}
          </text>
          <text x="50%" y="60%" text-anchor="middle" fill="#475569" font-family="Arial" font-size="10">
            Medical Imaging Study
          </text>
          <circle cx="256" cy="320" r="40" fill="none" stroke="#475569" stroke-width="2"/>
          <text x="50%" y="75%" text-anchor="middle" fill="#64748b" font-family="Arial" font-size="9">
            Preview Available • Original Preserved
          </text>
        </svg>
      `;

      // Convert SVG to PNG using Sharp
      await sharp(Buffer.from(placeholderSvg))
        .png()
        .resize(512, 512)
        .toFile(outputPath);

      logger.info(`DICOM placeholder image created: ${outputPath}`);
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