"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.XHRError = void 0;
/** Error class for jqXHR or XMLHttpRequest
 * Includes status, statusText, responseText, and stack
 * Also includes done method for legacy code that looks for it to determine if error
 * is an XHRError
 */
class XHRError extends Error {
    constructor(xhr) {
        const message = `HTTP Request failed with status ${xhr.status} (${xhr.statusText} - ${xhr.responseText || ""})`;
        super(message);
        Object.setPrototypeOf(this, XHRError.prototype);
        this.name = this.constructor.name;
        this.status = xhr.status;
        this.statusText = xhr.statusText;
        this.responseText = xhr.responseText;
        this.done = true;
    }
    toJSON() {
        return {
            message: this.message,
            status: this.status,
            statusText: this.statusText,
            responseText: this.responseText,
            stack: this.stack,
        };
    }
}
exports.XHRError = XHRError;
