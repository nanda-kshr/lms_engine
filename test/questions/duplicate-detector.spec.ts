import { DuplicateDetectorService } from '../../src/questions/services/duplicate-detector.service';

describe('DuplicateDetectorService', () => {
    describe('cosineSimilarity', () => {
        let service: DuplicateDetectorService;

        beforeEach(() => {
            // Access private method via prototype for testing
            service = Object.create(DuplicateDetectorService.prototype);
        });

        it('should return 1 for identical vectors', () => {
            const a = [1, 0, 0];
            const b = [1, 0, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(1.0, 5);
        });

        it('should return 0 for orthogonal vectors', () => {
            const a = [1, 0, 0];
            const b = [0, 1, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(0.0, 5);
        });

        it('should return -1 for opposite vectors', () => {
            const a = [1, 0, 0];
            const b = [-1, 0, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(-1.0, 5);
        });

        it('should handle normalized vectors correctly', () => {
            const a = [0.6, 0.8, 0];
            const b = [0.6, 0.8, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBeCloseTo(1.0, 5);
        });

        it('should return 0 for zero vectors', () => {
            const a = [0, 0, 0];
            const b = [1, 0, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBe(0);
        });

        it('should return 0 for different length vectors', () => {
            const a = [1, 0];
            const b = [1, 0, 0];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBe(0);
        });

        it('should detect high similarity (>0.90) for very similar vectors', () => {
            // Slightly perturbed vector
            const a = [0.5, 0.5, 0.5, 0.5];
            const b = [0.51, 0.49, 0.50, 0.50];
            const similarity = (service as any).cosineSimilarity(a, b);
            expect(similarity).toBeGreaterThan(0.99);
        });
    });
});
