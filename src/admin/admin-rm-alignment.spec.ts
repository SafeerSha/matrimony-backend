import { jest } from '@jest/globals';

jest.unstable_mockModule('../chat/chat.gateway', () => ({
  ChatGateway: class MockChatGateway {
    isUserOnline = () => false;
  },
}));

const { AdminService } = await import('./admin.service');
const { RmService } = await import('../rm/rm.service');

describe('Admin and RM Modules BRD Alignment', () => {
  let adminService: any;
  let rmService: any;
  let prisma: any;
  let storageService: any;
  let subscriptionService: any;

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
        findUnique: jest.fn() as any,
        update: jest.fn() as any,
        updateMany: jest.fn() as any,
        groupBy: jest.fn() as any,
      },
      photo: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
        findUnique: jest.fn() as any,
        update: jest.fn() as any,
        updateMany: jest.fn() as any,
        delete: jest.fn() as any,
        deleteMany: jest.fn() as any,
      },
      rmShortlist: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
        upsert: jest.fn() as any,
        deleteMany: jest.fn() as any,
      },
      rmInteraction: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
        create: jest.fn() as any,
      },
      rmFollowUp: {
        findMany: jest.fn() as any,
        count: jest.fn() as any,
        create: jest.fn() as any,
        findUnique: jest.fn() as any,
        update: jest.fn() as any,
      },
    };

    storageService = {
      deleteFile: jest.fn() as any,
    };

    subscriptionService = {
      activatePermit: jest.fn() as any,
      cancelChatPermit: jest.fn() as any,
    };

    adminService = new AdminService(prisma, storageService, subscriptionService);
    rmService = new RmService(prisma);
  });

  describe('Admin Panel - Photo Moderation', () => {
    it('should list unverified photos for moderation queue', async () => {
      prisma.photo.findMany.mockResolvedValue([
        { id: 'p1', url: 'https://cdn/p1.jpg', isVerified: false, user: { id: 'u1', firstName: 'John' } },
      ]);
      prisma.photo.count.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

      const res = await adminService.getPhotosForModeration({ status: 'unverified', page: 1, limit: 10 });
      expect(res.data).toHaveLength(1);
      expect(res.meta.total).toBe(1);
      expect(res.meta.unverifiedCount).toBe(1);
      expect(prisma.photo.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isVerified: false },
        }),
      );
    });

    it('should batch approve photos', async () => {
      prisma.photo.updateMany.mockResolvedValue({ count: 3 });

      const res = await adminService.batchVerifyPhotos(['p1', 'p2', 'p3'], 'approved');
      expect(res.success).toBe(true);
      expect(res.count).toBe(3);
      expect(prisma.photo.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ['p1', 'p2', 'p3'] } },
        data: { isVerified: true },
      });
    });

    it('should batch reject photos and clean up storage assets', async () => {
      prisma.photo.findMany.mockResolvedValue([
        { id: 'p1', url: 'https://cdn/p1.jpg', objectKey: 'p1.jpg', storageProvider: 'r2' },
      ]);
      storageService.deleteFile.mockResolvedValue(true);
      prisma.photo.deleteMany.mockResolvedValue({ count: 1 });

      const res = await adminService.batchVerifyPhotos(['p1'], 'rejected');
      expect(res.success).toBe(true);
      expect(res.count).toBe(1);
      expect(storageService.deleteFile).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://cdn/p1.jpg' }),
      );
    });
  });

  describe('Admin Panel - Profile Approval and Rejection', () => {
    it('should approve a pending profile to ACTIVE status', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER', status: 'PENDING_VERIFICATION' });
      prisma.user.update.mockResolvedValue({ id: 'u1', status: 'ACTIVE', profileRejectionReason: null });

      const res = await adminService.approveProfile('u1');
      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { status: 'ACTIVE', profileRejectionReason: null },
        }),
      );
    });

    it('should reject a profile with detailed feedback', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'u1', role: 'USER', status: 'PENDING_VERIFICATION' });
      prisma.user.update.mockResolvedValue({ id: 'u1', status: 'REJECTED', profileRejectionReason: 'Invalid name details' });

      const res = await adminService.rejectProfile('u1', 'Invalid name details');
      expect(res.success).toBe(true);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'u1' },
          data: { status: 'REJECTED', profileRejectionReason: 'Invalid name details' },
        }),
      );
    });
  });

  describe('Admin Panel - Relationship Manager Management', () => {
    it('should assign clients to an RM portfolio', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'rm1', role: 'RM', firstName: 'Priya' });
      prisma.user.updateMany.mockResolvedValue({ count: 2 });

      const res = await adminService.assignClientsToRm('rm1', ['u1', 'u2'], 'admin1');
      expect(res.success).toBe(true);
      expect(res.assignedCount).toBe(2);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['u1', 'u2'] }, role: 'USER' },
          data: expect.objectContaining({ assignedRmId: 'rm1', rmAssignedBy: 'admin1' }),
        }),
      );
    });

    it('should unassign clients from an RM', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 1 });

      const res = await adminService.unassignClientsFromRm(['u1']);
      expect(res.success).toBe(true);
      expect(res.unassignedCount).toBe(1);
      expect(prisma.user.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { assignedRmId: null, rmAssignedAt: null, rmAssignedBy: null },
        }),
      );
    });
  });

  describe('RM Module - Client Shortlisting on Behalf of Clients', () => {
    it('should shortlist a candidate profile for an assigned client', async () => {
      prisma.user.findUnique
        .mockResolvedValueOnce({ id: 'c1', role: 'USER', assignedRmId: 'rm1' })
        .mockResolvedValueOnce({ id: 'cand1', role: 'USER', status: 'ACTIVE', firstName: 'Anita' });

      prisma.rmShortlist.upsert.mockResolvedValue({
        id: 's1',
        clientId: 'c1',
        candidateId: 'cand1',
        status: 'SUGGESTED',
        notes: 'Great match in Bangalore',
      });
      prisma.rmInteraction.create.mockResolvedValue({});

      const res = await rmService.createShortlist(
        'c1',
        { candidateId: 'cand1', notes: 'Great match in Bangalore' },
        'rm1',
      );

      expect(res.success).toBe(true);
      expect(prisma.rmShortlist.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { clientId_candidateId: { clientId: 'c1', candidateId: 'cand1' } },
        }),
      );
      expect(prisma.rmInteraction.create).toHaveBeenCalled();
    });

    it('should delete a shortlisted candidate', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'c1', role: 'USER', assignedRmId: 'rm1' });
      prisma.rmShortlist.deleteMany.mockResolvedValue({ count: 1 });

      const res = await rmService.deleteShortlist('c1', 'cand1', 'rm1');
      expect(res.success).toBe(true);
      expect(prisma.rmShortlist.deleteMany).toHaveBeenCalledWith({
        where: { clientId: 'c1', candidateId: 'cand1' },
      });
    });
  });

  describe('RM Module - Interaction Tracking', () => {
    it('should record an interaction with channel, stage, and summary', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'c1', role: 'USER', assignedRmId: 'rm1', clientStage: 'NEW_LEAD' });
      prisma.rmInteraction.create.mockResolvedValue({
        id: 'i1',
        rmId: 'rm1',
        clientId: 'c1',
        channel: 'CALL',
        status: 'CONNECTED',
        clientStage: 'EXPLORING',
        summary: 'Discussed partner preferences and family background.',
      });
      prisma.user.update.mockResolvedValue({});

      const res = await rmService.createInteraction(
        'c1',
        {
          channel: 'CALL',
          status: 'CONNECTED',
          clientStage: 'EXPLORING',
          summary: 'Discussed partner preferences and family background.',
        },
        'rm1',
      );

      expect(res.success).toBe(true);
      expect(prisma.rmInteraction.create).toHaveBeenCalled();
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { clientStage: 'EXPLORING' },
      });
    });
  });

  describe('RM Module - Follow-Up Scheduling', () => {
    it('should schedule a follow-up for a client', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: 'c1', role: 'USER', assignedRmId: 'rm1' });
      prisma.rmFollowUp.create.mockResolvedValue({
        id: 'f1',
        rmId: 'rm1',
        clientId: 'c1',
        title: 'Call to review shortlisted profiles',
        scheduledAt: new Date(),
        priority: 'HIGH',
        status: 'PENDING',
      });

      const res = await rmService.createFollowUp(
        'c1',
        {
          title: 'Call to review shortlisted profiles',
          scheduledAt: new Date().toISOString(),
          priority: 'HIGH',
        },
        'rm1',
      );

      expect(res.success).toBe(true);
      expect(prisma.rmFollowUp.create).toHaveBeenCalled();
    });

    it('should mark a follow-up as completed', async () => {
      prisma.rmFollowUp.findUnique.mockResolvedValue({ id: 'f1', rmId: 'rm1', status: 'PENDING' });
      prisma.rmFollowUp.update.mockResolvedValue({ id: 'f1', status: 'COMPLETED' });

      const res = await rmService.updateFollowUp('f1', { status: 'COMPLETED' }, 'rm1');
      expect(res.success).toBe(true);
      expect(prisma.rmFollowUp.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'f1' },
          data: expect.objectContaining({ status: 'COMPLETED' }),
        }),
      );
    });
  });
});
