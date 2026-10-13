
(()=>{
  const $ = id => document.getElementById(id);
  const API_BASE = (
    document.querySelector('meta[name="neocorp-api-base"]')?.content || ''
  ).trim().replace(/\/$/, '');

  const MAX_BYTES = 500 * 1024 * 1024;
  const ALLOWED = new Set([
    'zip', 'json', 'gltf', 'glb', 'bin',
    'png', 'jpg', 'jpeg', 'webp'
  ]);

  let activeUser = null;
  let profile = null;
  let assets = [];
  let filter = 'all';
  let selectedFile = null;
  let uploading = false;

  const formatBytes = n => {
    if (!Number.isFinite(Number(n)) || Number(n) < 0)
      return 'Tamaño desconocido';

    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let value = Number(n);
    let index = 0;

    while (value >= 1024 && index < units.length - 1) {
      value /= 1024;
      index++;
    }

    return `${value.toLocaleString(undefined, {
      maximumFractionDigits: 1
    })} ${units[index]}`;
  };

  const extension = name =>
    String(name || '').split('.').pop().toLowerCase();

  const fileKind = name => {
    const ext = extension(name);

    if (['png', 'jpg', 'jpeg', 'webp'].includes(ext))
      return { kind: 'image', label: 'Imagen', glyph: ext.toUpperCase() };

    if (['gltf', 'glb', 'bin'].includes(ext))
      return { kind: 'model', label: 'Asset 3D', glyph: ext.toUpperCase() };

    if (ext === 'zip')
      return { kind: 'archive', label: 'Archivo ZIP', glyph: 'ZIP' };

    if (ext === 'json')
      return { kind: 'data', label: 'Datos', glyph: 'JSON' };

    return {
      kind: 'data',
      label: 'Archivo',
      glyph: ext.slice(0, 5).toUpperCase() || 'FILE'
    };
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[char]);
  }

  function notice(message, type = '') {
    const element = $('portalNotice');
    if (!element) return;

    element.textContent = message;
    element.className = `portal-notice${type ? ` ${type}` : ''}`;
    element.hidden = !message;
  }

  function fileError(file) {
    if (!file) return 'Selecciona un archivo primero.';

    if (!ALLOWED.has(extension(file.name))) {
      return 'Tipo no admitido. Usa ZIP, JSON, GLTF, GLB, BIN, PNG, JPG o WEBP.';
    }

    if (file.size > MAX_BYTES)
      return 'El archivo supera el límite de 500 MB.';

    if (file.size === 0)
      return 'El archivo está vacío.';

    return '';
  }

  function openLogin() {
    document.querySelector('.js-account')?.click();

    window.setTimeout(() => {
      $('openLoginFromMenu')?.click();
    }, 80);
  }

  function resetUpload() {
    selectedFile = null;

    if ($('portalFileInput')) $('portalFileInput').value = '';

    $('portalSelectedFile').hidden = true;
    $('portalUploadStatus').textContent = '';
    $('portalUploadStatus').className = 'portal-upload-status';
    $('portalUploadProgress').hidden = true;
    $('portalStartUpload').disabled = true;
    $('portalFilePrompt').textContent = 'Elige un archivo o arrástralo aquí';
  }

  function showUploadModal(show = true) {
    const modal = $('portalUploadModal');
    if (!modal) return;

    modal.hidden = !show;

    if (show) {
      window.setTimeout(() => $('portalFileInput')?.focus(), 30);
    } else if (!uploading) {
      resetUpload();
    }
  }

  function pickFile(file) {
    if (uploading) return;

    const error = fileError(file);
    selectedFile = error ? null : file;

    if (error) {
      $('portalSelectedFile').hidden = true;
      $('portalUploadStatus').textContent = error;
      $('portalUploadStatus').className = 'portal-upload-status error';
      $('portalStartUpload').disabled = true;
      $('portalFilePrompt').textContent = 'Elige un archivo o arrástralo aquí';
      return;
    }

    const kind = fileKind(file.name);

    $('portalSelectedFile').innerHTML = `
      <strong>${escapeHtml(kind.glyph)}</strong>
      <div>
        <strong>${escapeHtml(file.name)}</strong>
        <span>${formatBytes(file.size)} · ${escapeHtml(kind.label)}</span>
      </div>`;

    $('portalSelectedFile').hidden = false;
    $('portalFilePrompt').textContent = 'Archivo seleccionado';
    $('portalUploadStatus').textContent = '';
    $('portalUploadStatus').className = 'portal-upload-status';

    $('portalStartUpload').disabled =
      !API_BASE || !activeUser;
  }

  function normalizeAssets(payload) {
    const rows = Array.isArray(payload)
      ? payload
      : (payload?.assets || payload?.items || payload?.objects || []);

    if (!Array.isArray(rows)) return [];

    return rows.map((asset, index) => {
      const name =
        asset.name ||
        asset.originalName ||
        asset.filename ||
        String(asset.key || '').split('/').pop() ||
        `Asset ${index + 1}`;

      return {
        id: asset.id || asset.assetId || asset.key || `${name}-${index}`,
        name,
        size: asset.size ?? asset.sizeBytes ?? asset.contentLength ?? 0,
        uploadedAt:
          asset.uploadedAt ||
          asset.uploaded_at ||
          asset.lastModified ||
          asset.createdAt ||
          null
      };
    });
  }

  function formatDate(value) {
    if (!value) return 'Fecha desconocida';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Fecha desconocida';

    return new Intl.DateTimeFormat('es-MX', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(date);
  }

  function renderAssets() {
    const grid = $('portalAssetsGrid');
    const empty = $('portalEmpty');

    if (!grid || !empty) return;

    const query = ($('portalSearch')?.value || '')
      .trim()
      .toLowerCase();

    const shown = assets.filter(asset => {
      const matchesQuery = asset.name.toLowerCase().includes(query);

      const matchesFilter =
        filter !== 'recent' ||
        !asset.uploadedAt ||
        (
          Date.now() - new Date(asset.uploadedAt).getTime()
          < 30 * 86400000
        );

      return matchesQuery && matchesFilter;
    });

    grid.innerHTML = '';

    for (const asset of shown) {
      const kind = fileKind(asset.name);
      const card = document.createElement('article');

      card.className = 'portal-file-card';

      card.innerHTML = `
        <div class="portal-file-visual type-${kind.kind}">
          <div class="portal-file-glyph">${escapeHtml(kind.glyph)}</div>
          <span class="portal-file-kind">${escapeHtml(kind.label)}</span>
        </div>
        <div class="portal-file-info">
          <p class="portal-file-name" title="${escapeHtml(asset.name)}">
            ${escapeHtml(asset.name)}
          </p>
          <div class="portal-file-meta">
            <span>${formatBytes(asset.size)}</span>
            <span class="portal-file-date">${escapeHtml(formatDate(asset.uploadedAt))}</span>
          </div>
        </div>`;

      grid.appendChild(card);
    }

    $('portalLoading').hidden = true;
    grid.hidden = shown.length === 0;
    empty.hidden = shown.length !== 0;

    if (assets.length === 0) {
      $('portalEmptyTitle').textContent =
        activeUser ? 'Tu espacio comienza aquí.' : 'Tu espacio te espera.';

      $('portalEmptyCopy').textContent =
        activeUser
          ? 'Sube tu primer archivo y aparecerá aquí.'
          : 'Inicia sesión con NeoID para ver y subir tus archivos.';

      $('portalEmptyUpload').textContent =
        activeUser ? 'Subir primer archivo' : 'Iniciar sesión';
    } else if (shown.length === 0) {
      $('portalEmptyTitle').textContent = 'No hay archivos coincidentes.';
      $('portalEmptyCopy').textContent =
        'Prueba otra búsqueda o cambia el filtro.';
      $('portalEmptyUpload').textContent = 'Subir archivos';
    }
  }

  async function authHeaders() {
    const user = window.NeoFirebase?.auth?.currentUser;

    if (!user)
      throw new Error('Inicia sesión con NeoID para continuar.');

    return {
      Authorization: `Bearer ${await user.getIdToken()}`
    };
  }

  async function loadAssets() {
    $('portalLoading').hidden = false;
    $('portalAssetsGrid').hidden = true;
    $('portalEmpty').hidden = true;
    notice('');

    if (!activeUser) {
      assets = [];
      renderAssets();
      return;
    }

    if (!API_BASE) {
      assets = [];
      renderAssets();

      notice(
        'Falta configurar la URL del Worker API. La conexión aún no está configurada.',
        'error'
      );
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/v1/assets`, {
        headers: await authHeaders()
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status === 404 || response.status === 405) {
          throw new Error(
            'El Worker todavía no tiene GET /v1/assets. Hay que añadir el listado privado de archivos.'
          );
        }

        throw new Error(
          data.error || data.message ||
          `No se pudieron cargar los archivos (${response.status}).`
        );
      }

      assets = normalizeAssets(data);
      renderAssets();
    } catch (error) {
      assets = [];
      renderAssets();

      notice(
        error.message || 'Error al cargar los archivos.',
        'error'
      );
    }
  }

  async function uploadSelectedFile() {
    if (uploading) return;

    if (!activeUser) {
      showUploadModal(false);
      openLogin();
      return;
    }

    if (!API_BASE) {
      $('portalUploadStatus').textContent =
        'Falta configurar la URL del Worker API.';
      $('portalUploadStatus').className = 'portal-upload-status error';
      return;
    }

    const error = fileError(selectedFile);

    if (error) {
      $('portalUploadStatus').textContent = error;
      $('portalUploadStatus').className = 'portal-upload-status error';
      return;
    }

    uploading = true;
    $('portalStartUpload').disabled = true;
    $('portalCancelUpload').disabled = true;
    $('portalFileInput').disabled = true;
    $('portalUploadProgress').hidden = false;
    $('portalUploadStatus').textContent =
      'Subiendo archivo al almacenamiento NeoCorp…';
    $('portalUploadStatus').className = 'portal-upload-status';

    try {
      const headers = await authHeaders();
      const body = new FormData();

      body.append('file', selectedFile, selectedFile.name);

      const response = await fetch(`${API_BASE}/v1/assets/upload`, {
        method: 'POST',
        headers,
        body
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || data.message ||
          `Falló la subida (${response.status}).`
        );
      }

      $('portalUploadStatus').textContent =
        'Archivo subido. Actualizando biblioteca…';
      $('portalUploadStatus').className = 'portal-upload-status success';

      uploading = false;
      $('portalUploadProgress').hidden = true;
      $('portalCancelUpload').disabled = false;
      $('portalFileInput').disabled = false;

      showUploadModal(false);
      notice('Archivo subido. Actualizando tu biblioteca…', 'success');

      await loadAssets();

      if (!$('portalNotice').classList.contains('error')) {
        notice('Archivo subido correctamente.', 'success');
      }
    } catch (error) {
      $('portalUploadStatus').textContent =
        error.message || 'No se pudo subir el archivo.';
      $('portalUploadStatus').className = 'portal-upload-status error';
    } finally {
      uploading = false;
      $('portalStartUpload').disabled =
        !selectedFile || !API_BASE || !activeUser;
      $('portalCancelUpload').disabled = false;
      $('portalFileInput').disabled = false;
      $('portalUploadProgress').hidden = true;
    }
  }

  $('portalOpenUpload')?.addEventListener('click', () =>
    activeUser ? showUploadModal(true) : openLogin()
  );

  $('portalEmptyUpload')?.addEventListener('click', () =>
    activeUser ? showUploadModal(true) : openLogin()
  );

  $('portalCloseUpload')?.addEventListener('click', () =>
    showUploadModal(false)
  );

  $('portalCancelUpload')?.addEventListener('click', () =>
    showUploadModal(false)
  );

  $('portalUploadModal')?.addEventListener('click', event => {
    if (event.target === $('portalUploadModal')) {
      showUploadModal(false);
    }
  });

  $('portalFileInput')?.addEventListener('change', event =>
    pickFile(event.target.files?.[0] || null)
  );

  $('portalStartUpload')?.addEventListener('click', uploadSelectedFile);
  $('portalSearch')?.addEventListener('input', renderAssets);

  document.querySelectorAll('[data-portal-filter]').forEach(button => {
    button.addEventListener('click', () => {
      filter = button.dataset.portalFilter || 'all';

      document.querySelectorAll('[data-portal-filter]').forEach(item => {
        const active = item === button;

        item.classList.toggle('active', active);
        item.setAttribute('aria-selected', String(active));
      });

      renderAssets();
    });
  });

  const dropzone = $('portalDropzone');

  ['dragenter', 'dragover'].forEach(type => {
    dropzone?.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(type => {
    dropzone?.addEventListener(type, event => {
      event.preventDefault();
      dropzone.classList.remove('dragover');
    });
  });

  dropzone?.addEventListener('drop', event => {
    pickFile(event.dataTransfer?.files?.[0] || null);
  });

  document.addEventListener('keydown', event => {
    if (
      event.key === 'Escape' &&
      $('portalUploadModal') &&
      !$('portalUploadModal').hidden
    ) {
      showUploadModal(false);
    }
  });

  window.addEventListener('neo-auth-state', event => {
    activeUser = event.detail?.user || null;
    profile = event.detail?.profile || null;

    $('portalUserName').textContent =
      profile?.displayName ||
      profile?.username ||
      activeUser?.email ||
      'NeoID';

    $('portalOpenUpload').disabled = !activeUser;

    if (!activeUser) {
      notice('Inicia sesión con NeoID para acceder a tus archivos.');
    }

    loadAssets();
  });

  if (window.NeoFirebase?.auth?.currentUser) {
    activeUser = window.NeoFirebase.auth.currentUser;

    $('portalUserName').textContent =
      activeUser.email || 'NeoID';

    loadAssets();
  } else {
    $('portalLoading').hidden = true;
    assets = [];
    renderAssets();
  }
})();
