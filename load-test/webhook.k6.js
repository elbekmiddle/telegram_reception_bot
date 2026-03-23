import http from 'k6/http';
import { check } from 'k6';

export const options = {
  scenarios: {
    webhook_spike: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 2000,
      stages: [
        { target: 1000, duration: '30s' },
        { target: 2500, duration: '2m' },
        { target: 2500, duration: '1m' },
        { target: 0, duration: '30s' }
      ]
    }
  }
};

const baseUrl = __ENV.BASE_URL || 'http://localhost:4000';
const webhookPath = __ENV.WEBHOOK_PATH || '/telegram/webhook';

export default function () {
  const updateId = Math.floor(Math.random() * 1_000_000_000);
  const body = JSON.stringify({
    update_id: updateId,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 1234567, type: 'private' },
      from: { id: 1234567, is_bot: false, first_name: 'Load', language_code: 'uz' },
      text: '/start'
    }
  });

  const res = http.post(`${baseUrl}${webhookPath}`, body, {
    headers: { 'Content-Type': 'application/json' }
  });

  check(res, {
    'status is 200': r => r.status === 200 || r.status === 401
  });
}
