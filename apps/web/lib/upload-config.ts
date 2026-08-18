/**
 * 32MB parts: the 2GB ceiling lands at 64 parts, far under S3's 10,000-part
 * limit, and each retry costs at most one part's worth of bandwidth.
 */
export const PART_SIZE = 32 * 1024 ** 2;

export const expectedParts = (sizeBytes: number) => Math.ceil(sizeBytes / PART_SIZE);
