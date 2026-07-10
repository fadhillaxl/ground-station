export const resolveUrl = (url) => {
    if (!url) return url;
    if (
        url.startsWith('http://') ||
        url.startsWith('https://') ||
        url.startsWith('ws://') ||
        url.startsWith('wss://') ||
        url.startsWith('data:')
    ) {
        return url;
    }
    const base = import.meta.env.BASE_URL.replace(/\/$/, "");
    if (base && url.startsWith('/') && !url.startsWith(base + '/')) {
        return `${base}${url}`;
    }
    return url;
};
