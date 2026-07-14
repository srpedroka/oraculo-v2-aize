export function normalizeS3Endpoint(endpoint: string, bucket: string) {
  const normalizedEndpoint = endpoint.trim().replace(/\/+$/, "");
  const encodedBucket = encodeURIComponent(bucket.trim());
  const bucketSuffix = `/${encodedBucket}`;
  return normalizedEndpoint.endsWith(bucketSuffix)
    ? normalizedEndpoint.slice(0, -bucketSuffix.length)
    : normalizedEndpoint;
}
