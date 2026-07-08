const accessForm = document.querySelector('.access-form');
const accessStatus = document.querySelector('[data-access-status]');
const inboxList = document.querySelector('[data-inbox-list]');
const inboxMeta = document.querySelector('[data-inbox-meta]');
const clearAccessButton = document.querySelector('[data-clear-access]');
const accessStorageKey = 'tianxiangqin-admin-access-key';

const setAccessStatus = (message, tone = 'success') => {
  if (!accessStatus) {
    return;
  }

  accessStatus.textContent = message;
  accessStatus.dataset.tone = tone;
};

const formatTime = (value) => {
  if (!value) {
    return '未提供時間';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-TW');
};

const renderMessages = (messages = []) => {
  if (!inboxList) {
    return;
  }

  if (!messages.length) {
    inboxList.innerHTML = `
      <article class="empty-state">
        <h3>還沒有訊息</h3>
        <p>目前資料庫裡沒有收到新的聯絡表單。</p>
      </article>
    `;
    return;
  }

  inboxList.innerHTML = messages.map((message) => `
    <article class="message-card">
      <div class="message-head">
        <div>
          <h3>${message.subject || '未命名主旨'}</h3>
          <p>${message.name || '未知姓名'} / ${message.email || '未知信箱'}</p>
        </div>
        <span class="chip">${formatTime(message.created_at)}</span>
      </div>
      <p class="message-body">${String(message.message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br />')}</p>
    </article>
  `).join('');
};

const loadMessages = async (accessKey) => {
  const response = await fetch('/api/messages', {
    headers: {
      'x-admin-key': accessKey,
    },
  });

  if (!response.ok) {
    throw new Error(response.status === 401 ? '存取碼錯誤或後台未啟用。' : '無法載入訊息。');
  }

  return response.json();
};

const refreshInbox = async (accessKey) => {
  const payload = await loadMessages(accessKey);
  renderMessages(payload.messages || []);

  if (inboxMeta) {
    inboxMeta.textContent = `資料來源：${payload.source === 'supabase' ? 'Supabase' : '本機檔案'} / 共 ${payload.messages.length} 筆`;
  }
};

if (accessForm) {
  const savedAccessKey = sessionStorage.getItem(accessStorageKey);
  if (savedAccessKey) {
    accessForm.elements.accessKey.value = savedAccessKey;
    refreshInbox(savedAccessKey)
      .then(() => setAccessStatus('已載入訊息。'))
      .catch((error) => setAccessStatus(error.message, 'error'));
  }

  accessForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const accessKey = String(accessForm.elements.accessKey.value || '').trim();

    if (!accessKey) {
      setAccessStatus('請先輸入後台存取碼。', 'error');
      return;
    }

    try {
      setAccessStatus('載入中...');
      await refreshInbox(accessKey);
      sessionStorage.setItem(accessStorageKey, accessKey);
      setAccessStatus('已載入訊息。');
    } catch (error) {
      setAccessStatus(error.message, 'error');
    }
  });
}

if (clearAccessButton) {
  clearAccessButton.addEventListener('click', () => {
    sessionStorage.removeItem(accessStorageKey);
    if (accessForm) {
      accessForm.reset();
    }
    renderMessages([]);
    if (inboxMeta) {
      inboxMeta.textContent = '尚未載入資料。';
    }
    setAccessStatus('已清除存取碼。');
  });
}
