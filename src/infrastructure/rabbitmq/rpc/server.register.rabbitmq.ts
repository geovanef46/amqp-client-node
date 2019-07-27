import { IClientRequest, IResourceHandler } from '../../port/rpc/resource.handler.interface'
import { IServerOptions } from '../../../application/port/communications.options.interface'
import { IBusConnection } from '../../port/connection/connection.interface'
import { IStartConsumerResult } from '../../../application/port/queue.options.interface'
import { Identifier } from '../../../di/identifier'
import { ICustomLogger } from '../../../utils/custom.logger'
import { DI } from '../../../di/di'
import { IServerRegister } from '../../port/rpc/server.register.interface'

export class ServerRegisterRabbitmq implements IServerRegister {

    private resource_handlers: Map<string, IResourceHandler[]> = new Map<string, IResourceHandler[]>()
    private consumersInitialized: Map<string, boolean> = new Map<string, boolean>()

    private readonly _logger: ICustomLogger

    constructor(private readonly _connection: IBusConnection,
                private readonly _queueName: string,
                private readonly _exchangeName: string,
                private readonly _routingKey: string,
                private readonly _options?: IServerOptions) {
        this._logger = DI.get(Identifier.CUSTOM_LOGGER)
    }

    public async start(): Promise<void> {
        try {
            await this
                .registerRoutingKeyServer(this._queueName, this._exchangeName, this._routingKey, this._options)
            return Promise.resolve()
        } catch (err) {
            return Promise.reject(err)
        }
    }

    public addResource(resourceName: string, resource: (...any: any) => any): boolean {

        const resourceHandler: IResourceHandler = {
            resource_name: resourceName,
            handle: resource
        }

        return this.registerResource(this._queueName, resourceHandler)
    }

    public removeResource(resourceName: string): boolean {

        return this.unregisterResource(this._queueName, resourceName)
    }

    public getAllResource(): object {

        const resources = this.getResource()

        if (resources)
            return resources
        else
            return {}
    }

    private registerResource(queueName: string,
                             resource: IResourceHandler): boolean {

        const resources_handler: IResourceHandler[] | undefined = this.resource_handlers.get(queueName)

        if (!resources_handler) {
            this.resource_handlers.set(queueName, [resource])
            this._logger.info('Resource ' + queueName + ' registered!')
            return true
        }

        for (const actualResource of resources_handler) {
            if (actualResource.resource_name === resource.resource_name) {
                return false
            }
        }

        resources_handler.push(resource)
        this.resource_handlers.set(queueName, resources_handler)

        this._logger.info('Resource ' + queueName + ' registered!')
        return true

    }

    private unregisterResource(queueName: string, resourceName: string): boolean {
        const resources_handler: IResourceHandler[] | undefined = this.resource_handlers.get(queueName)

        if (!resources_handler) {
            return false
        }

        for (const index in resources_handler) {
            if (resources_handler[index].resource_name === resourceName) {
                resources_handler.splice(Number(index), 1)
                this.resource_handlers.set(queueName, resources_handler)
                return true
            }
        }
    }

    private getResource(): Map<string, any> {
        return this.resource_handlers
    }

    private registerRoutingKeyServer(queueName: string,
                                     exchangeName: string,
                                     routingKey: string,
                                     options: IServerOptions): Promise<boolean> {
        return new Promise<boolean>(async (resolve, reject) => {
            try {

                if (!this._connection.isConnected)
                    return reject(new Error('Connection Failed'))

                let exchangeOptions
                let queueOptions

                if (options) {
                    exchangeOptions = options.exchange
                    queueOptions = options.queue
                }

                const exchange = await this._connection.getExchange(exchangeName, exchangeOptions)
                this._logger.info('Exchange creation ' + exchange.name + ' realized with success!')

                const queue = this._connection.getQueue(queueName, queueOptions)
                this._logger.info('Queue creation ' + queue.name + ' realized with success!')

                if (await exchange.initialized) {
                    this._logger.info('RoutingKey ' + routingKey + ' registered!')
                    await queue.bind(exchange, routingKey)
                }

                if (!this.consumersInitialized.get(queueName)) {
                    this.consumersInitialized.set(queueName, true)

                    await queue.activateConsumer((message) => {
                        message.ack() // acknowledge that the message has been received (and processed)

                        const clientRequest: IClientRequest = message.getContent()

                        const resources_handler: IResourceHandler[] | undefined =
                            this.resource_handlers.get(queueName)

                        if (resources_handler) {
                            for (const resource of resources_handler) {
                                if (resource.resource_name === clientRequest.resource_name) {
                                    try {
                                        return resource.handle.apply('', clientRequest.handle)
                                    } catch (err) {
                                        this._logger.error(`Consumer function returned error: ${err.message}`)
                                        return err
                                    }
                                }
                            }
                        }
                        return new Error('Resource not registered in server')
                    }, { noAck: false }).then((result: IStartConsumerResult) => {
                        this._logger.info('Server registered in ' + exchangeName + ' exchange!')
                    })
                        .catch(err => {
                            console.log(err)
                        })
                }
                return resolve(true)
            } catch (err) {
                return reject(err)
            }
        })
    }

}
