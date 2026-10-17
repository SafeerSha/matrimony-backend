import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';

/**
 * Quality level for WebP conversion.
 * 82 is a good balance: visually near-lossless at ~30-60% smaller than JPEG/PNG.
 */
const WEBP_QUALITY = 82;

export interface ConvertedImage {
  buffer: Buffer;
  mimetype: 'image/webp';
  size: number;
}

@Injectable()
export class ImageProcessorService {
  private readonly logger = new Logger(ImageProcessorService.name);

  /**
   * Convert any supported image buffer (JPEG, PNG, GIF, WebP) to WebP.
   * If the input is already WebP, it is re-encoded to normalise quality.
   * Returns the converted buffer, its byte length, and the fixed mime type.
   */
  async convertToWebP(
    inputBuffer: Buffer,
    originalMime: string,
  ): Promise<ConvertedImage> {
    try {
      let pipeline = sharp(inputBuffer).webp({ quality: WEBP_QUALITY });

      // For GIFs we preserve animation if present; still outputs WebP
      if (originalMime === 'image/gif') {
        pipeline = sharp(inputBuffer, { animated: true }).webp({
          quality: WEBP_QUALITY,
        });
      }

      const buffer = await pipeline.toBuffer();
      return {
        buffer,
        mimetype: 'image/webp',
        size: buffer.length,
      };
    } catch (err) {
      this.logger.error('WebP conversion failed, using original buffer', err);
      // Fallback: return original buffer unchanged rather than failing the upload
      return {
        buffer: inputBuffer,
        mimetype: 'image/webp',
        size: inputBuffer.length,
      };
    }
  }
}
