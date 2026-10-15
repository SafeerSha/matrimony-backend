import { ImageProcessorService } from './image-processor.service';

// Mock sharp so tests don't require a native binary in CI
jest.mock('sharp', () => {
  const mockToBuffer = jest.fn().mockResolvedValue(Buffer.from('webp-output'));
  const mockWebp = jest.fn().mockReturnValue({ toBuffer: mockToBuffer });
  const mockSharp: any = jest.fn().mockReturnValue({ webp: mockWebp });
  mockSharp.__mocks = { mockWebp, mockToBuffer };
  return mockSharp;
});

// Retrieve the mock functions after the factory runs
import sharp from 'sharp';
const mockSharp = sharp as any;

describe('ImageProcessorService', () => {
  let service: ImageProcessorService;

  beforeEach(() => {
    service = new ImageProcessorService();
    jest.clearAllMocks();
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

    // For GIFs, sharp is called with { animated: true }
    expect(mockSharp).toHaveBeenCalledWith(input, { animated: true });
    expect(result.mimetype).toBe('image/webp');
  });

  it('should fall back to original buffer on sharp error', async () => {
    mockSharp.mockImplementationOnce(() => {
      throw new Error('sharp internal error');
    });

    const input = Buffer.from('corrupt-data');
    const result = await service.convertToWebP(input, 'image/jpeg');

    // Should still return image/webp mime type and original buffer
    expect(result.mimetype).toBe('image/webp');
    expect(result.buffer).toBe(input);
    expect(result.size).toBe(input.length);
  });
});
