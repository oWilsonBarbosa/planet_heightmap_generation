// Generate's CDN dependency is resolved locally when running headless under Node.js.
const CDN = 'https://cdn.jsdelivr.net/npm/delaunator@5.0.1/+esm';
export async function resolve(specifier, context, next) {
    if (specifier === CDN) return next('delaunator', { ...context, parentURL: import.meta.url });
    return next(specifier, context);
}
