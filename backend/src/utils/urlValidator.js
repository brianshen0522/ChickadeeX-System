const dns = require('dns').promises;

const IPV4_PRIVATE_RANGES = [
    { start: '0.0.0.0', end: '0.255.255.255' },
    { start: '10.0.0.0', end: '10.255.255.255' },
    { start: '127.0.0.0', end: '127.255.255.255' },
    { start: '169.254.0.0', end: '169.254.255.255' },
    { start: '172.16.0.0', end: '172.31.255.255' },
    { start: '192.168.0.0', end: '192.168.255.255' }
];

const IPV6_PRIVATE_PREFIXES = [
    '::1', // loopback
    'fc', // unique local
    'fd', // unique local
    'fe80', // link-local
    '::' // unspecified
];

const toIpv4Int = (ip) => {
    return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0);
};

const isIpv4Private = (ip) => {
    const ipInt = toIpv4Int(ip);
    return IPV4_PRIVATE_RANGES.some((range) => {
        const start = toIpv4Int(range.start);
        const end = toIpv4Int(range.end);
        return ipInt >= start && ipInt <= end;
    });
};

const isIpv6Private = (ip) => {
    const normalized = ip.toLowerCase();
    return IPV6_PRIVATE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
};

const isBlockedHostname = (hostname) => {
    const lower = hostname.toLowerCase();
    if (lower === 'localhost') return true;
    if (lower.endsWith('.localhost') || lower.endsWith('.local') || lower.endsWith('.internal')) return true;
    return false;
};

const validateExternalUrl = async (inputUrl) => {
    let parsed;
    try {
        parsed = new URL(inputUrl);
    } catch (error) {
        throw new Error('Invalid URL for image preview');
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Unsupported URL protocol for image preview');
    }

    if (!parsed.hostname || isBlockedHostname(parsed.hostname)) {
        throw new Error('Blocked hostname for image preview');
    }

    const lookupResults = await dns.lookup(parsed.hostname, { all: true });
    for (const record of lookupResults) {
        if (record.family === 4 && isIpv4Private(record.address)) {
            throw new Error('Blocked private IP for image preview');
        }
        if (record.family === 6 && isIpv6Private(record.address)) {
            throw new Error('Blocked private IP for image preview');
        }
    }

    return true;
};

module.exports = {
    validateExternalUrl
};
