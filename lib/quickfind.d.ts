export declare function encodeRequest(clientRows: any): {
    [x: string]: any;
};
export declare function encodeResponse(serverRows: any, encodedRequest: any): Partial<any>;
export declare function decodeResponse(encodedResponse: any, clientRows: any, sort: any): any;
