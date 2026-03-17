import { pino } from 'pino'

const logger = pino({ name: 'collector' })
logger.info('Collector starting...')
// WhatsApp client initialization will go here
