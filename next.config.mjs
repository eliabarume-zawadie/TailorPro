/** Static export (Z-1, AD-2): the authenticated app is a client-rendered shell; no Next.js server exists in production. */
export default {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
