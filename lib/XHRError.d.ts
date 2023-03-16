/** Error class for jqXHR or XMLHttpRequest
 * Includes status, statusText, responseText, and stack
 * Also includes done method for legacy code that looks for it to determine if error
 * is an XHRError
 */
export declare class XHRError extends Error {
    status: number;
    statusText: string;
    responseText?: string;
    done: true;
    constructor(xhr: {
        status: number;
        statusText: string;
        responseText?: string;
    });
    toJSON(): {
        message: string;
        status: number;
        statusText: string;
        responseText: string | undefined;
        stack: string | undefined;
    };
}
