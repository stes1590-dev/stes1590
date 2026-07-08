const http = require('http');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const rootDir = __dirname;
const envFile = path.join(rootDir, '.env');
const dataDir = path.join(rootDir, 'data');
const dataFile = path.join(dataDir, 'contacts.json');

const loadEnvFile = () => {
  if (!fs.existsSync(envFile)) {
    return;
  }

  const envContent = fs.readFileSync(envFile, 'utf8');

  envContent.split(/\r?\n/).forEach((line) => {
    const trimmedLine = line.trim();

    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return;
    }

    const separatorIndex = trimmedLine.indexOf('=');

    if (separatorIndex === -1) {
      return;
    }

    const key = trimmedLine.slice(0, separatorIndex).trim();
    let value = trimmedLine.slice(separatorIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
};

loadEnvFile();

const port = Number(process.env.PORT || 3000);
const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
const supabaseSecretKey = String(process.env.SUPABASE_SECRET_KEY || '').trim();
const supabaseTable = String(process.env.SUPABASE_TABLE || 'contacts').trim();
const supabaseEnabled = Boolean(supabaseUrl && supabaseSecretKey);
const adminAccessKey = String(process.env.ADMIN_ACCESS_KEY || '').trim();
const resendApiKey = String(process.env.RESEND_API_KEY || '').trim();
const notifyEmailTo = String(process.env.NOTIFY_EMAIL_TO || '').trim();
const notifyEmailFrom = String(process.env.NOTIFY_EMAIL_FROM || '').trim();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

const ensureDataFile = () => {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, '[]', 'utf8');
  }
};

const saveLocalContact = (record) => {
  const records = JSON.parse(fs.readFileSync(dataFile, 'utf8') || '[]');
  records.push(record);
  fs.writeFileSync(dataFile, JSON.stringify(records, null, 2), 'utf8');
};

const listLocalContacts = () => {
  const records = JSON.parse(fs.readFileSync(dataFile, 'utf8') || '[]');

  return records
    .map((record, index) => ({
      id: record.id || index + 1,
      name: record.name,
      email: record.email,
      subject: record.subject,
      message: record.message,
      created_at: record.createdAt || record.created_at || null,
    }))
    .sort((left, right) => {
      const leftTime = new Date(left.created_at || 0).getTime();
      const rightTime = new Date(right.created_at || 0).getTime();
      return rightTime - leftTime;
    });
};

const supabaseRequest = ({ method, pathname, body, query = '' }) => new Promise((resolve, reject) => {
  const endpoint = new URL(`${pathname}${query}`, supabaseUrl);
  const requestBody = body ? JSON.stringify(body) : null;

  const request = https.request(
    endpoint,
    {
      method,
      headers: {
        apikey: supabaseSecretKey,
        Authorization: `Bearer ${supabaseSecretKey}`,
        ...(requestBody
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(requestBody),
            }
          : {}),
      },
    },
    (supabaseResponse) => {
      const chunks = [];

      supabaseResponse.on('data', (chunk) => {
        chunks.push(chunk);
      });

      supabaseResponse.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const parsedBody = rawBody ? JSON.parse(rawBody) : null;

        if (supabaseResponse.statusCode >= 200 && supabaseResponse.statusCode < 300) {
          resolve(parsedBody);
          return;
        }

        reject(new Error(`Supabase error ${supabaseResponse.statusCode}: ${rawBody}`));
      });
    }
  );

  request.on('error', reject);

  if (requestBody) {
    request.write(requestBody);
  }

  request.end();
});

const saveSupabaseContact = (record) => new Promise((resolve, reject) => {
  supabaseRequest({
    method: 'POST',
    pathname: `/rest/v1/${supabaseTable}`,
    body: {
      name: record.name,
      email: record.email,
      subject: record.subject,
      message: record.message,
      created_at: record.createdAt,
    },
  })
    .then(() => resolve())
    .catch(reject);
});

const listSupabaseContacts = () => supabaseRequest({
  method: 'GET',
  pathname: `/rest/v1/${supabaseTable}`,
  query: '?select=id,name,email,subject,message,created_at&order=created_at.desc',
});

const sendResendNotification = (record, storage) => new Promise((resolve, reject) => {
  if (!resendApiKey || !notifyEmailTo || !notifyEmailFrom) {
    resolve(false);
    return;
  }

  const requestBody = JSON.stringify({
    from: notifyEmailFrom,
    to: [notifyEmailTo],
    subject: `新的網站詢問：${record.subject}`,
    text: [
      `姓名：${record.name}`,
      `電子郵件：${record.email}`,
      `主旨：${record.subject}`,
      `來源：${storage}`,
      '',
      '需求內容：',
      record.message,
    ].join('\n'),
  });

  const request = https.request(
    'https://api.resend.com/emails',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(requestBody),
      },
    },
    (mailResponse) => {
      const chunks = [];

      mailResponse.on('data', (chunk) => {
        chunks.push(chunk);
      });

      mailResponse.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');

        if (mailResponse.statusCode >= 200 && mailResponse.statusCode < 300) {
          resolve(true);
          return;
        }

        reject(new Error(`Resend error ${mailResponse.statusCode}: ${body}`));
      });
    }
  );

  request.on('error', reject);
  request.write(requestBody);
  request.end();
});

const readBody = (request) => new Promise((resolve, reject) => {
  const chunks = [];

  request.on('data', (chunk) => {
    chunks.push(chunk);
  });

  request.on('end', () => {
    resolve(Buffer.concat(chunks).toString('utf8'));
  });

  request.on('error', reject);
});

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(JSON.stringify(payload));
};

const sendText = (response, statusCode, text) => {
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  response.end(text);
};

const normalizePayload = async (request) => {
  const rawBody = await readBody(request);
  const contentType = request.headers['content-type'] || '';

  if (contentType.includes('application/json')) {
    return rawBody ? JSON.parse(rawBody) : {};
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(rawBody));
  }

  return {};
};

const serveFile = (filePath, response) => {
  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendText(response, 404, 'Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      'Content-Type': mimeTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    response.end(content);
  });
};

ensureDataFile();

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const isLocalRequest = ['localhost', '127.0.0.1', '::1'].includes(requestUrl.hostname);

  if (request.method === 'GET' && requestUrl.pathname === '/api/messages') {
    const isAuthorized = adminAccessKey
      ? request.headers['x-admin-key'] === adminAccessKey
      : isLocalRequest;

    if (!isAuthorized) {
      sendJson(response, 401, { ok: false, message: 'Unauthorized' });
      return;
    }

    try {
      const messages = supabaseEnabled
        ? await listSupabaseContacts()
        : listLocalContacts();

      sendJson(response, 200, {
        ok: true,
        source: supabaseEnabled ? 'supabase' : 'file',
        messages,
      });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: 'Unable to load messages.' });
    }

    return;
  }

  if (request.method === 'POST' && requestUrl.pathname === '/api/contact') {
    try {
      const payload = await normalizePayload(request);
      const name = String(payload.name || '').trim();
      const email = String(payload.email || '').trim();
      const subject = String(payload.subject || '').trim();
      const message = String(payload.message || '').trim();

      if (!name || !email || !subject || !message) {
        sendJson(response, 400, { ok: false, message: 'Please fill in all fields.' });
        return;
      }

      const contactRecord = {
        name,
        email,
        subject,
        message,
        createdAt: new Date().toISOString(),
      };

      let storage = 'file';
      let notified = false;

      if (supabaseEnabled) {
        try {
          await saveSupabaseContact(contactRecord);
          storage = 'supabase';
        } catch (error) {
          console.warn('Supabase save failed, falling back to local file:', error.message);
          saveLocalContact(contactRecord);
        }
      } else {
        saveLocalContact(contactRecord);
      }

      try {
        notified = await sendResendNotification(contactRecord, storage);
      } catch (error) {
        console.warn('Email notification failed:', error.message);
      }

      sendJson(response, 200, { ok: true, storage, notified });
    } catch (error) {
      sendJson(response, 500, { ok: false, message: 'Unable to save submission.' });
    }

    return;
  }

  let pathname = requestUrl.pathname;

  if (pathname === '/') {
    pathname = '/index.html';
  }

  const filePath = path.join(rootDir, pathname);

  if (!filePath.startsWith(rootDir)) {
    sendText(response, 400, 'Bad request');
    return;
  }

  const resolvedPath = fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()
    ? path.join(filePath, 'index.html')
    : filePath;

  if (fs.existsSync(resolvedPath)) {
    serveFile(resolvedPath, response);
    return;
  }

  sendText(response, 404, 'Not found');
});

server.listen(port, () => {
  const storageLabel = supabaseEnabled
    ? `Supabase table ${supabaseTable}`
    : `local file ${path.basename(dataFile)}`;

  console.log(`天香琴 running at http://localhost:${port} using ${storageLabel}`);
});