import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client'
export const registry = new Registry()
collectDefaultMetrics({ register: registry })
export const processedUpdates = new Counter({ name:'bot_processed_updates_total', help:'Processed updates', registers:[registry], labelNames:['kind'] as const })
export const updateFailures = new Counter({ name:'bot_update_failures_total', help:'Failed updates', registers:[registry], labelNames:['kind'] as const })
export const webhookLatency = new Histogram({ name:'bot_webhook_latency_ms', help:'Webhook latency', registers:[registry], buckets:[10,25,50,100,250,500,1000,3000] })
