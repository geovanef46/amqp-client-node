export interface IConnectionFactory {
    createConnection(url: string | object, socketOptions: any, reconnectStrategy: any): Promise<any>
}

export interface ITopology {
    exchanges: { name: string, type?: string, options?: any }[]
    queues: { name: string, options?: any }[]
    bindings: { source: string, queue?: string, exchange?: string, pattern?: string, args?: any }[]
}
