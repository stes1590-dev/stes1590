const menuToggle = document.querySelector('.menu-toggle');
const siteNav = document.querySelector('.site-nav');
const backdrop = document.querySelector('.backdrop');
const revealItems = document.querySelectorAll('.reveal');
const contactForm = document.querySelector('.contact-form');
const loginForm = document.querySelector('.login-form');
const supabaseUrl = 'https://evjrvibjnixowkaudplv.supabase.co';
const supabasePublishableKey = 'sb_publishable_zLOH7N3I7ExXcVvZeVIqCg_hjiZwAU2';
const supabaseTable = 'contacts';

const setMenuState = (isOpen) => {
  if (!menuToggle || !siteNav || !backdrop) {
    return;
  }

  siteNav.classList.toggle('is-open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
  backdrop.hidden = !isOpen;
};

if (menuToggle && siteNav && backdrop) {
  menuToggle.addEventListener('click', () => {
    const nextState = !siteNav.classList.contains('is-open');
    setMenuState(nextState);
  });

  backdrop.addEventListener('click', () => setMenuState(false));

  siteNav.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => setMenuState(false));
  });

  setMenuState(false);
}

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.18 }
);

revealItems.forEach((item) => observer.observe(item));

const statusMessage = document.querySelector('[data-form-status]');

const showStatus = (message, tone = 'success') => {
  if (!statusMessage) {
    return;
  }

  statusMessage.textContent = message;
  statusMessage.dataset.tone = tone;
};

if (contactForm) {
  contactForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const submitButton = contactForm.querySelector('button[type="submit"]');
    const formData = new FormData(contactForm);
    const payload = Object.fromEntries(formData.entries());
    const fallbackEmail = 'stes1590@gmail.com';
    const supabasePayload = {
      name: payload.name,
      email: payload.email,
      subject: payload.subject,
      message: payload.message,
      created_at: new Date().toISOString(),
    };
    const bodyText = [
      `姓名：${payload.name || ''}`,
      `電子郵件：${payload.email || ''}`,
      '',
      `需求內容：${payload.message || ''}`,
    ].join('\r\n');
    const mailtoUrl = `mailto:${fallbackEmail}?subject=${encodeURIComponent(payload.subject || '合作詢問')}&body=${encodeURIComponent(bodyText)}`;

    try {
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = '送出中...';
      }

      let submitted = false;

      try {
        const response = await fetch('/api/contact', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          throw new Error('api submit failed');
        }

        const result = await response.json();
        submitted = true;
        showStatus(result.notified
          ? '訊息已送出，也已寄出通知信。'
          : '訊息已送出，我會盡快回覆你。');
      } catch (apiError) {
        const supabaseResponse = await fetch(`${supabaseUrl}/rest/v1/${supabaseTable}`, {
          method: 'POST',
          headers: {
            apikey: supabasePublishableKey,
            Authorization: `Bearer ${supabasePublishableKey}`,
            'Content-Type': 'application/json',
            Prefer: 'return=minimal',
          },
          body: JSON.stringify(supabasePayload),
        });

        if (!supabaseResponse.ok) {
          throw new Error('supabase submit failed');
        }

        submitted = true;
        showStatus('訊息已送出到資料庫。');
      }

      if (submitted) {
        contactForm.reset();
      }
    } catch (error) {
      showStatus('沒有可用的資料庫或後端，已改用寄信方式。', 'error');
      window.location.href = mailtoUrl;
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = '送出聯絡';
      }
    }
  });
}

if (loginForm) {
  loginForm.addEventListener('submit', (event) => {
    event.preventDefault();
  });
}

const currentPath = window.location.pathname.split('/').pop() || 'index.html';

document.querySelectorAll('.site-nav a').forEach((link) => {
  const linkPath = link.getAttribute('href');
  if (linkPath === currentPath || (currentPath === '' && linkPath === 'index.html')) {
    link.classList.add('is-active');
  }
});
