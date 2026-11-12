import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { Readable } from 'stream';

const mockToBuffer = jest.fn<any>().mockResolvedValue(Buffer.from('webp-output'));
const mockMetadata = jest.fn<any>().mockResolvedValue({ width: 800, height: 600 });
const mockResize = jest.fn<any>();
const mockWebp = jest.fn<any>();

const mockPipeline: any = {
  metadata: mockMetadata,
  resize: mockResize,
  webp: mockWebp,
  toBuffer: mockToBuffer,
};
mockResize.mockReturnValue(mockPipeline);
mockWebp.mockReturnValue(mockPipeline);

const mockSharp: any = jest.fn().mockReturnValue(mockPipeline);
mockSharp.concurrency = jest.fn();
mockSharp.cache = jest.fn();

jest.unstable_mockModule('sharp', () => ({
  default: mockSharp,
}));

const { ImageProcessorService } = await import('./image-processor.service');

describe('ImageProcessorService', () => {
  let service: InstanceType<typeof ImageProcessorService>;

  beforeEach(() => {
    service = new ImageProcessorService();
    jest.clearAllMocks();
    mockMetadata.mockResolvedValue({ width: 800, height: 600 });
    mockResize.mockReturnValue(mockPipeline);
    mockWebp.mockReturnValue(mockPipeline);
    mockToBuffer.mockResolvedValue(Buffer.from('webp-output'));
    mockSharp.mockReturnValue(mockPipeline);
  });

  it('should convert a JPEG buffer to WebP', async () => {
    const input = Buffer.from('fake-jpeg');
    const result = await service.convertToWebP(input, 'image/jpeg');

    expect(mockSharp).toHaveBeenCalledWith(input);
    expect(result.mimetype).toBe('image/webp');
    expect(result.buffer).toBeInstanceOf(Buffer);
    expect(result.size).toBeGreaterThan(0);
  });

  it('should convert a PNG buffer to WebP', async () => {
    const input = Buffer.from('fake-png');
    const result = await service.convertToWebP(input, 'image/png');

    expect(result.mimetype).toBe('image/webp');
  });

  it('should handle GIF input with animated flag', async () => {
    const input = Buffer.from('fake-gif');
    const result = await service.convertToWebP(input, 'image/gif');

    expect(mockSharp).toHaveBeenCalledWith(input, { animated: true });
    expect(result.mimetype).toBe('image/webp');
  });

  it('should downscale images exceeding 2048px dimension', async () => {
    mockMetadata.mockResolvedValue({ width: 4000, height: 3000 });
    const input = Buffer.from('large-jpeg');
    await service.convertToWebP(input, 'image/jpeg');

    expect(mockResize).toHaveBeenCalledWith({
      width: 2048,
      height: 2048,
      fit: 'inside',
      withoutEnlargement: true,
    });
  });

  it('should convert a stream source via convertToWebPFromSource without buffering output', async () => {
    const inputStream = Readable.from([Buffer.from('stream-bytes')]);
    const result = await service.convertToWebPFromSource(
      { kind: 'stream', stream: inputStream, tempPath: '/tmp/test.jpg' },
      'image/jpeg',
    );

    expect(mockSharp).toHaveBeenCalledWith(inputStream);
    expect(result.mimetype).toBe('image/webp');
    expect(result.size).toBeNull();
    expect(result.stream).toBe(mockPipeline);
  });

  it('should fall back to original buffer on sharp error', async () => {
    mockSharp.mockImplementationOnce(() => {
      throw new Error('sharp internal error');
    });

    const input = Buffer.from('corrupt-data');
    const result = await service.convertToWebP(input, 'image/jpeg');

    expect(result.mimetype).toBe('image/webp');
    expect(result.buffer).toBe(input);
    expect(result.size).toBe(input.length);
  });
});
