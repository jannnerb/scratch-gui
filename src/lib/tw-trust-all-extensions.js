// When enabled, every extension is loaded without the sandbox and without a permission prompt,
// including extensions that come from projects. This is dangerous; the user opts in via the
// custom extension modal. Persisted so it survives restarts.

const KEY = 'tw:trust_all_extensions';

let cached = null;

const getTrustAllExtensions = () => {
    if (cached === null) {
        try {
            cached = localStorage.getItem(KEY) === 'true';
        } catch (e) {
            cached = false;
        }
    }
    return cached;
};

const setTrustAllExtensions = enabled => {
    cached = enabled === true;
    try {
        localStorage.setItem(KEY, cached);
    } catch (e) {
        // ignore
    }
};

export {
    getTrustAllExtensions,
    setTrustAllExtensions
};
