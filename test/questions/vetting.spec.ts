import { VettingService } from '../../src/questions/services/vetting.service';
import { VettingAction, VettingStatus } from '../../src/schemas/question.schema';

describe('VettingService - Weight Logic', () => {
    describe('Weight Deltas', () => {
        let service: VettingService;

        beforeEach(() => {
            service = Object.create(VettingService.prototype);
        });

        it('should return +0.1 for accept without duplicate warning', () => {
            const delta = (service as any).calculateWeightDelta(VettingAction.ACCEPT, false);
            expect(delta).toBe(0.1);
        });

        it('should return +0.05 for accept with duplicate warning', () => {
            const delta = (service as any).calculateWeightDelta(VettingAction.ACCEPT, true);
            expect(delta).toBe(0.05);
        });

        it('should return -0.2 for reject without duplicate warning', () => {
            const delta = (service as any).calculateWeightDelta(VettingAction.REJECT, false);
            expect(delta).toBe(-0.2);
        });

        it('should return -0.3 for reject with duplicate warning', () => {
            const delta = (service as any).calculateWeightDelta(VettingAction.REJECT, true);
            expect(delta).toBe(-0.3);
        });

        it('should return 0 for skip', () => {
            const delta = (service as any).calculateWeightDelta(VettingAction.SKIP, false);
            expect(delta).toBe(0);
        });
    });

    describe('Weight Clamping', () => {
        let service: VettingService;

        beforeEach(() => {
            service = Object.create(VettingService.prototype);
        });

        it('should clamp weight to minimum 0.2', () => {
            const clamped = (service as any).clamp(0.1, 0.2, 2.0);
            expect(clamped).toBe(0.2);
        });

        it('should clamp weight to maximum 2.0', () => {
            const clamped = (service as any).clamp(2.5, 0.2, 2.0);
            expect(clamped).toBe(2.0);
        });

        it('should not change weight within range', () => {
            const clamped = (service as any).clamp(1.5, 0.2, 2.0);
            expect(clamped).toBe(1.5);
        });
    });

    describe('Status Derivation', () => {
        let service: VettingService;

        beforeEach(() => {
            service = Object.create(VettingService.prototype);
        });

        it('should return APPROVED when weight >= 1.2, accept >= 2, reject < accept', () => {
            const status = (service as any).deriveStatus(1.2, 2, 0);
            expect(status).toBe(VettingStatus.APPROVED);
        });

        it('should return APPROVED when weight >= 1.2, accept >= 2, reject < accept (with some rejects)', () => {
            const status = (service as any).deriveStatus(1.3, 5, 2);
            expect(status).toBe(VettingStatus.APPROVED);
        });

        it('should return PENDING when weight >= 1.2 but accept < 2', () => {
            const status = (service as any).deriveStatus(1.2, 1, 0);
            expect(status).toBe(VettingStatus.PENDING);
        });

        it('should return PENDING when weight >= 1.2 but reject >= accept', () => {
            const status = (service as any).deriveStatus(1.2, 2, 2);
            expect(status).toBe(VettingStatus.PENDING);
        });

        it('should return REJECTED when weight <= 0.6', () => {
            const status = (service as any).deriveStatus(0.6, 0, 3);
            expect(status).toBe(VettingStatus.REJECTED);
        });

        it('should return REJECTED when weight is below 0.6', () => {
            const status = (service as any).deriveStatus(0.4, 1, 4);
            expect(status).toBe(VettingStatus.REJECTED);
        });

        it('should return PENDING for middle weight values', () => {
            const status = (service as any).deriveStatus(1.0, 1, 0);
            expect(status).toBe(VettingStatus.PENDING);
        });

        it('should allow recovery: previously rejected can become pending', () => {
            // Starts rejected at 0.5, then recovers to 0.7
            const status = (service as any).deriveStatus(0.7, 2, 1);
            expect(status).toBe(VettingStatus.PENDING);
        });
    });
});
