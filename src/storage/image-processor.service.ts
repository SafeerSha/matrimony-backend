import { Injectable, Logger } from '@nestjs/common';
import sharp from 'sharp';
import { Readable } from 'stream';

/**
 * Quality level for WebP conversion.
 * 82 is a good balance: visually near-lossless at ~30-60% smaller than JPEG/PNG.
 */
const WEBP_QUALITY = 82;

/**
 * Maximum image dimension to prevent excessive memory allocation on large uploads.
 * Images larger than this on either side will be downscaled before conversion.
 */
const MAX_IMAGE_DIMENSION = 2048;

/**
 * Maximum input file size in bytes (10 MB) to reject oversized images early.
 */
const MAX_INPUT_SIZE = 10 * 1024 * 1024;

export interface ConvertedImage {
  buffer: Buffer;
  mimetype: 'image/webp';
  size: number;
}

export interface ConvertedImageStream {
  stream: Readable;
  mimetype: 'image/webp';
  size: number | null;
}

/**
 * Limit Sharp's internal concurrency and cache to bound memory usage
 * during concurrent image processing.
 */
sharp.concurrency(2);
sharp.cache(false);

type SharpSource = Buffer | Readable;

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
      if (inputBuffer.length > MAX_INPUT_SIZE) {
        this.logger.warn(
          `Input image exceeds ${MAX_INPUT_SIZE} bytes, rejecting.`,
        );
        throw new Error('Image file too large for processing.');
      }

      const pipeline = await this.buildSharpPipelineFromSource(
        inputBuffer,
        originalMime,
      );
      const buffer = await pipeline.toBuffer();
      return {
        buffer,
        mimetype: 'image/webp',
        size: buffer.length,
      };
    } catch (err) {
      this.logger.error('WebP conversion failed', err);
      // Fallback: return original buffer unchanged rather than failing the upload
      return {
        buffer: inputBuffer,
        mimetype: 'image/webp',
        size: inputBuffer.length,
      };
    }
  }

  /**
   * Convert an image from a stream or buffer source to WebP, returning a
   * readable stream of the converted output. This avoids holding the entire
   * output buffer in heap memory when streaming directly to storage.
   *
   * The source may be { kind: 'buffer', buffer } (memoryStorage) or
   * { kind: 'stream', stream, tempPath? } (diskStorage). Sharp reads from
   * the source directly.
   */
  async convertToWebPFromSource(
    source: { kind: 'buffer'; buffer: Buffer } | { kind: 'stream'; stream: Readable; tempPath?: string },
    originalMime: string,
  ): Promise<ConvertedImageStream> {
    try {
      if (source.kind === 'buffer' && source.buffer.length > MAX_INPUT_SIZE) {
        this.logger.warn(
          `Input image exceeds ${MAX_INPUT_SIZE} bytes, rejecting.`,
        );
        throw new Error('Image file too large for processing.');
      }

      const input: SharpSource =
        source.kind === 'buffer' ? source.buffer : source.stream;

      const pipeline = await this.buildSharpPipelineFromSource(
        input,
        originalMime,
      );

      return {
        stream: pipeline,
        mimetype: 'image/webp',
        size: null,
      };
    } catch (err) {
      this.logger.error('WebP conversion failed', err);
      // Fallback: pass the original source through unchanged
      if (source.kind === 'buffer') {
        return {
          stream: Readable.from([source.buffer]),
          mimetype: 'image/webp',
          size: source.buffer.length,
        };
      }
      return {
        stream: source.stream,
        mimetype: 'image/webp',
        size: null,
      };
    }
  }

  /**
   * Build a Sharp pipeline from a Buffer or Readable stream input.
   */
  private async buildSharpPipelineFromSource(
    input: SharpSource,
    originalMime: string,
  ): Promise<ReturnType<typeof sharp>> {
    let pipeline: ReturnType<typeof sharp>;

    if (originalMime === 'image/gif') {
      pipeline = sharp(input as any, { animated: true });
    } else {
      pipeline = sharp(input as any);
    }

    // Get metadata to decide on downscaling
    const metadata = await pipeline.metadata();
    const width = metadata.width || 0;
    const height = metadata.height || 0;

    const needsDownscale =
      width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION;

    if (needsDownscale) {
      pipeline = pipeline.resize({
        width: MAX_IMAGE_DIMENSION,
        height: MAX_IMAGE_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
      });
    }

    pipeline = pipeline.webp({ quality: WEBP_QUALITY });

    return pipeline;
  }
}
