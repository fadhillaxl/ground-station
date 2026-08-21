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
    const base = ((typeof window !== 'undefined' && window.location?.pathname?.startsWith('/groundstationdev')) ? '/groundstationdev' : (import.meta.env.BASE_URL || '/groundstation/')).replace(/\/$/, "");
    const cleanBase = (base === '.' || base === './') ? '' : base;
    if (cleanBase && url.startsWith('/') && !url.startsWith(cleanBase + '/')) {
        return `${cleanBase}${url}`;
    }
    return url;
};
