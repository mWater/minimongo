/** Error class for jqXHR or XMLHttpRequest
 * Includes status, statusText, responseText, and stack
 * Also includes done method for legacy code that looks for it to determine if error
 * is an XHRError
 */
export class XHRError extends Error {
  status: number
  statusText: string
  responseText?: string
  done: true

  constructor(xhr: { status: number; statusText: string; responseText?: string }) {
    const message = `HTTP Request failed with status ${xhr.status} (${xhr.statusText})`

    super(message)
    Object.setPrototypeOf(this, XHRError.prototype)

    this.name = this.constructor.name
    this.status = xhr.status
    this.statusText = xhr.statusText
    this.responseText = xhr.responseText
    this.done = true
  }

  toJSON() {
    return {
      message: this.message,
      status: this.status,
      statusText: this.statusText,
      responseText: this.responseText,
      stack: this.stack,
    }
  }
}
