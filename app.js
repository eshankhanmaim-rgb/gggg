/* ====================================
   PrimeXStream - Main Application Logic
   Powered by Aniwatch API (hianime)
   ==================================== */

// API Configuration
// When hosted on Vercel: uses /api/proxy (serverless function)
// When running locally: uses CORS proxy

function isLocalDevelopment() {
    return window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.protocol === 'file:';
}

// CORS proxy for local development only
const CORS_PROXY = 'https://corsproxy.io/?';
const ANIWATCH_BASE = 'https://aniwatch-api-chi.vercel.app/api/v2/hianime';

// Build API URL - uses local proxy on Vercel, CORS proxy on localhost
function buildApiUrl(path) {
    if (isLocalDevelopment()) {
        // Local development: use CORS proxy
        return CORS_PROXY + encodeURIComponent(`${ANIWATCH_BASE}/${path}`);
    } else {
        // Production (Vercel): use serverless proxy
        return `/api/proxy?path=${encodeURIComponent(path)}`;
    }
}

const API_ENDPOINTS = {
    home: () => buildApiUrl('home'),
    search: (query, page = 1) => buildApiUrl(`search?q=${encodeURIComponent(query)}&page=${page}`),
    info: (id) => buildApiUrl(`anime/${id}`),
    episodes: (id) => buildApiUrl(`anime/${id}/episodes`),
    servers: (episodeId) => buildApiUrl(`episode/servers?animeEpisodeId=${episodeId}`),
    sources: (episodeId, server = 'hd-1', category = 'sub') =>
        buildApiUrl(`episode/sources?animeEpisodeId=${episodeId}&server=${server}&category=${category}`),
    category: (name, page = 1) => buildApiUrl(`${name}?page=${page}`),
    searchSuggestions: (query) => buildApiUrl(`search/suggestion?q=${encodeURIComponent(query)}`),
    genre: (name, page = 1) => buildApiUrl(`genre/${name}?page=${page}`)
};

// Application State
const state = {
    currentPage: 'home',
    currentAnime: null,
    currentEpisodes: [],
    currentEpisodeIndex: 0,
    searchQuery: '',
    categoryPage: 1,
    selectedGenres: [],
    hlsPlayer: null,
    currentEpisodeId: null,
    currentServer: 'hd-1',
    currentCategory: 'sub'
};

// DOM Elements
const elements = {
    pages: {
        home: document.getElementById('homePage'),
        category: document.getElementById('categoryPage'),
        search: document.getElementById('searchPage'),
        browse: document.getElementById('browsePage'),
        detail: document.getElementById('detailPage'),
        player: document.getElementById('playerPage')
    },
    grids: {
        topAiring: document.getElementById('topAiringGrid'),
        popular: document.getElementById('popularGrid'),
        favorite: document.getElementById('favoriteGrid'),
        category: document.getElementById('categoryGrid'),
        search: document.getElementById('searchGrid'),
        browse: document.getElementById('browseGrid'),
        episodes: document.getElementById('episodesGrid'),
        playerEpisodes: document.getElementById('playerEpisodeList')
    },
    hero: {
        section: document.getElementById('heroSection'),
        title: document.getElementById('heroTitle'),
        description: document.getElementById('heroDescription'),
        meta: document.getElementById('heroMeta'),
        watchBtn: document.getElementById('heroWatchBtn'),
        infoBtn: document.getElementById('heroInfoBtn')
    },
    detail: {
        backdrop: document.getElementById('detailBackdrop'),
        poster: document.getElementById('detailPoster'),
        title: document.getElementById('detailTitle'),
        altTitle: document.getElementById('detailAltTitle'),
        meta: document.getElementById('detailMeta'),
        genres: document.getElementById('detailGenres'),
        description: document.getElementById('detailDescription'),
        watchBtn: document.getElementById('detailWatchBtn')
    },
    player: {
        video: document.getElementById('videoPlayer'),
        loading: document.getElementById('videoLoading'),
        animeTitle: document.getElementById('playerAnimeTitle'),
        episodeTitle: document.getElementById('playerEpisodeTitle'),
        serverButtons: document.getElementById('serverButtons'),
        qualityButtons: document.getElementById('qualityButtons'),
        prevBtn: document.getElementById('prevEpisodeBtn'),
        nextBtn: document.getElementById('nextEpisodeBtn')
    },
    search: {
        input: document.getElementById('searchInput'),
        suggestions: document.getElementById('searchSuggestions'),
        queryText: document.getElementById('searchQueryText')
    },
    pagination: {
        category: document.getElementById('categoryPagination'),
        search: document.getElementById('searchPagination'),
        browse: document.getElementById('browsePagination')
    },
    toast: document.getElementById('toast'),
    toastMessage: document.getElementById('toastMessage'),
    mobileMenu: document.getElementById('mobileMenu')
};

// ====================================
// API Functions
// ====================================

async function fetchAPI(url) {
    try {
        console.log('Fetching:', url);
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const json = await response.json();
        return json;
    } catch (error) {
        console.error('API Error:', error);
        showToast('Failed to fetch data. Please try again.', 'error');
        return null;
    }
}

// Normalize anime data from Aniwatch API format
function normalizeAnime(anime) {
    return {
        id: anime.id,
        title: anime.name || anime.title,
        image: anime.poster || anime.image,
        type: anime.type,
        releaseDate: anime.releaseDate,
        subOrDub: anime.episodes?.sub ? 'sub' : anime.episodes?.dub ? 'dub' : null,
        duration: anime.duration,
        rating: anime.rating
    };
}

// Get home page data
async function getHomeData() {
    const response = await fetchAPI(API_ENDPOINTS.home());
    return response?.success ? response.data : null;
}

// Get anime by category
async function getCategoryAnime(category, page = 1) {
    const response = await fetchAPI(API_ENDPOINTS.category(category, page));
    if (!response?.success) return null;
    return {
        results: response.data.animes?.map(normalizeAnime) || [],
        currentPage: response.data.currentPage || page,
        hasNextPage: response.data.hasNextPage || false
    };
}

async function getTopAiring(page = 1) {
    return getCategoryAnime('top-airing', page);
}

async function getMostPopular(page = 1) {
    return getCategoryAnime('most-popular', page);
}

async function getMostFavorite(page = 1) {
    return getCategoryAnime('most-favorite', page);
}

async function searchAnime(query, page = 1) {
    const response = await fetchAPI(API_ENDPOINTS.search(query, page));
    if (!response?.success) return null;
    return {
        results: response.data.animes?.map(normalizeAnime) || [],
        currentPage: response.data.currentPage || page,
        hasNextPage: response.data.hasNextPage || false
    };
}

async function getAnimeInfo(id) {
    const response = await fetchAPI(API_ENDPOINTS.info(id));
    if (!response?.success) return null;

    const anime = response.data.anime?.info || {};
    const moreInfo = response.data.anime?.moreInfo || {};

    // Also fetch episodes
    const episodesResponse = await fetchAPI(API_ENDPOINTS.episodes(id));
    const episodes = episodesResponse?.success ? episodesResponse.data.episodes || [] : [];

    return {
        id: anime.id,
        title: anime.name || anime.title,
        image: anime.poster || anime.image,
        description: anime.description,
        type: moreInfo.type || anime.type,
        status: moreInfo.status || anime.status,
        releaseDate: moreInfo.aired,
        totalEpisodes: moreInfo.episodes?.sub || episodes.length,
        genres: moreInfo.genres || [],
        otherName: moreInfo.japanese,
        subOrDub: 'sub',
        episodes: episodes.map(ep => ({
            id: ep.episodeId,
            number: ep.number,
            title: ep.title,
            isFiller: ep.isFiller
        }))
    };
}

async function getStreamingSources(episodeId, server = 'hd-1', category = 'sub') {
    try {
        const url = API_ENDPOINTS.sources(episodeId, server, category);
        console.log('Fetching streaming sources:', isLocalDevelopment() ? '(via CORS proxy)' : '(via serverless proxy)');

        const response = await fetch(url, {
            signal: AbortSignal.timeout(30000) // 30 second timeout
        });

        if (!response.ok) {
            console.log('Streaming source fetch failed with status:', response.status);
            return null;
        }

        const json = await response.json();
        if (!json?.success) {
            console.log('Streaming source response not successful');
            return null;
        }

        return {
            sources: json.data.sources || [],
            subtitles: json.data.subtitles || [],
            intro: json.data.intro,
            outro: json.data.outro
        };
    } catch (error) {
        console.error('Streaming sources error:', error.message);
        return null;
    }
}

async function getSearchSuggestions(query) {
    const response = await fetchAPI(API_ENDPOINTS.searchSuggestions(query));
    if (!response?.success) return null;
    return {
        suggestions: response.data.suggestions?.map(s => ({
            id: s.id,
            title: s.name,
            image: s.poster,
            releaseDate: s.moreInfo?.join(' • ') || ''
        })) || []
    };
}

async function advancedSearch(params) {
    if (params.genres) {
        const response = await fetchAPI(API_ENDPOINTS.genre(params.genres.toLowerCase(), params.page || 1));
        if (!response?.success) return null;
        return {
            results: response.data.animes?.map(normalizeAnime) || [],
            currentPage: response.data.currentPage || params.page || 1,
            hasNextPage: response.data.hasNextPage || false
        };
    }
    return getTopAiring(params.page || 1);
}

// ====================================
// Rendering Functions
// ====================================

function createAnimeCard(anime) {
    const card = document.createElement('div');
    card.className = 'anime-card';
    card.onclick = () => showAnimeDetail(anime.id);

    card.innerHTML = `
        <img src="${anime.image}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/300x450?text=No+Image'">
        <div class="anime-card-overlay"></div>
        ${anime.subOrDub ? `<span class="anime-card-badge">${anime.subOrDub.toUpperCase()}</span>` : ''}
        <div class="anime-card-play">
            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
        </div>
        <div class="anime-card-info">
            <h3 class="anime-card-title">${anime.title}</h3>
            <div class="anime-card-meta">
                ${anime.releaseDate ? `<span>${anime.releaseDate}</span>` : ''}
                ${anime.type ? `<span>${anime.type}</span>` : ''}
            </div>
        </div>
    `;

    return card;
}

function renderAnimeGrid(container, animeList, append = false) {
    if (!container) return;

    if (!append) {
        container.innerHTML = '';
    }

    if (!animeList || animeList.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No anime found.</p>';
        return;
    }

    animeList.forEach(anime => {
        container.appendChild(createAnimeCard(anime));
    });
}

function renderPagination(container, currentPage, hasNextPage, onPageChange) {
    if (!container) return;

    container.innerHTML = '';

    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = '← Previous';
        prevBtn.onclick = () => onPageChange(currentPage - 1);
        container.appendChild(prevBtn);
    }

    const startPage = Math.max(1, currentPage - 2);
    const endPage = currentPage + 2;

    for (let i = startPage; i <= endPage; i++) {
        if (i < 1) continue;
        if (!hasNextPage && i > currentPage) break;

        const pageBtn = document.createElement('button');
        pageBtn.textContent = i;
        pageBtn.className = i === currentPage ? 'active' : '';
        pageBtn.onclick = () => onPageChange(i);
        container.appendChild(pageBtn);
    }

    if (hasNextPage) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Next →';
        nextBtn.onclick = () => onPageChange(currentPage + 1);
        container.appendChild(nextBtn);
    }
}

function renderEpisodes(container, episodes, onEpisodeClick, currentEpisodeId = null) {
    if (!container) return;

    container.innerHTML = '';

    if (!episodes || episodes.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">No episodes available.</p>';
        return;
    }

    episodes.forEach((episode, index) => {
        const btn = document.createElement('button');
        btn.className = 'episode-btn' + (episode.id === currentEpisodeId ? ' playing' : '');
        btn.textContent = episode.number || (index + 1);
        btn.title = episode.title || `Episode ${episode.number || index + 1}`;
        btn.onclick = () => onEpisodeClick(episode, index);
        container.appendChild(btn);
    });
}

// ====================================
// Page Navigation
// ====================================

function showPage(pageName) {
    Object.values(elements.pages).forEach(page => {
        if (page) page.classList.remove('active');
    });

    if (elements.pages[pageName]) {
        elements.pages[pageName].classList.add('active');
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        if (link.dataset.page === pageName) {
            link.classList.add('active');
        }
    });

    state.currentPage = pageName;
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function showHome() {
    showPage('home');
    await loadHomeData();
}

async function loadHomeData() {
    const homeData = await getHomeData();

    if (homeData) {
        // Use spotlight or trending for hero
        if (homeData.spotlightAnimes && homeData.spotlightAnimes.length > 0) {
            const heroAnime = homeData.spotlightAnimes[0];
            setHeroFromSpotlight(heroAnime);
        }

        // Top Airing
        if (homeData.topAiringAnimes) {
            renderAnimeGrid(elements.grids.topAiring, homeData.topAiringAnimes.map(normalizeAnime).slice(0, 12));
        }

        // Trending (as Popular)
        if (homeData.trendingAnimes) {
            renderAnimeGrid(elements.grids.popular, homeData.trendingAnimes.map(normalizeAnime).slice(0, 12));
        }

        // Latest Episodes (as Favorites)
        if (homeData.latestEpisodeAnimes) {
            renderAnimeGrid(elements.grids.favorite, homeData.latestEpisodeAnimes.map(normalizeAnime).slice(0, 12));
        }
    } else {
        // Fallback to category endpoints
        const topAiringData = await getTopAiring(1);
        if (topAiringData?.results) {
            renderAnimeGrid(elements.grids.topAiring, topAiringData.results.slice(0, 12));
            if (topAiringData.results[0]) {
                await setHeroAnime(topAiringData.results[0]);
            }
        }

        const popularData = await getMostPopular(1);
        if (popularData?.results) {
            renderAnimeGrid(elements.grids.popular, popularData.results.slice(0, 12));
        }

        const favoriteData = await getMostFavorite(1);
        if (favoriteData?.results) {
            renderAnimeGrid(elements.grids.favorite, favoriteData.results.slice(0, 12));
        }
    }
}

function setHeroFromSpotlight(spotlight) {
    state.heroAnime = spotlight;

    elements.hero.section.style.backgroundImage = `url(${spotlight.poster})`;
    elements.hero.title.textContent = spotlight.name || spotlight.title;
    elements.hero.description.textContent = spotlight.description || 'Watch now on PrimeXStream!';

    elements.hero.meta.innerHTML = `
        ${spotlight.type ? `<span>📺 ${spotlight.type}</span>` : ''}
        ${spotlight.otherInfo ? spotlight.otherInfo.map(info => `<span>${info}</span>`).join('') : ''}
    `;

    elements.hero.watchBtn.onclick = () => showAnimeDetail(spotlight.id);
    elements.hero.infoBtn.onclick = () => showAnimeDetail(spotlight.id);
}

async function setHeroAnime(anime) {
    const info = await getAnimeInfo(anime.id);
    if (!info) return;

    state.heroAnime = info;

    elements.hero.section.style.backgroundImage = `url(${info.image})`;
    elements.hero.title.textContent = info.title;
    elements.hero.description.textContent = info.description || 'No description available.';

    elements.hero.meta.innerHTML = `
        ${info.type ? `<span>📺 ${info.type}</span>` : ''}
        ${info.status ? `<span>📡 ${info.status}</span>` : ''}
        ${info.totalEpisodes ? `<span>🎬 ${info.totalEpisodes} Episodes</span>` : ''}
        ${info.releaseDate ? `<span>📅 ${info.releaseDate}</span>` : ''}
    `;

    elements.hero.watchBtn.onclick = () => {
        if (info.episodes && info.episodes.length > 0) {
            playEpisode(info.episodes[0], 0, info);
        } else {
            showToast('No episodes available', 'error');
        }
    };

    elements.hero.infoBtn.onclick = () => showAnimeDetail(anime.id);
}

async function showCategory(category, page = 1) {
    showPage('category');

    const titles = {
        'top-airing': '🔥 Top Airing Anime',
        'most-popular': '⭐ Most Popular Anime',
        'most-favorite': '❤️ Most Favorite Anime'
    };

    document.getElementById('categoryTitle').textContent = titles[category] || category;
    elements.grids.category.innerHTML = '<div class="loading-skeleton"></div>';

    const data = await getCategoryAnime(category, page);

    if (data?.results) {
        renderAnimeGrid(elements.grids.category, data.results);
        renderPagination(
            elements.pagination.category,
            data.currentPage || page,
            data.hasNextPage,
            (newPage) => showCategory(category, newPage)
        );
    }
}

async function performSearch(query = null) {
    const searchQuery = query || elements.search.input.value.trim();
    if (!searchQuery) return;

    state.searchQuery = searchQuery;
    elements.search.queryText.textContent = searchQuery;
    elements.search.suggestions.classList.remove('active');

    showPage('search');
    elements.grids.search.innerHTML = '<div class="loading-skeleton"></div>';

    const data = await searchAnime(searchQuery, 1);

    if (data?.results) {
        renderAnimeGrid(elements.grids.search, data.results);
        renderPagination(
            elements.pagination.search,
            data.currentPage || 1,
            data.hasNextPage,
            (page) => loadSearchPage(searchQuery, page)
        );
    }
}

async function loadSearchPage(query, page) {
    elements.grids.search.innerHTML = '<div class="loading-skeleton"></div>';

    const data = await searchAnime(query, page);

    if (data?.results) {
        renderAnimeGrid(elements.grids.search, data.results);
        renderPagination(
            elements.pagination.search,
            data.currentPage || page,
            data.hasNextPage,
            (newPage) => loadSearchPage(query, newPage)
        );
    }
}

function showAdvancedSearch() {
    showPage('browse');
    applyFilters();
}

async function applyFilters(page = 1) {
    const params = {
        page: page,
        type: document.getElementById('filterType')?.value,
        status: document.getElementById('filterStatus')?.value,
        season: document.getElementById('filterSeason')?.value,
        genres: state.selectedGenres.join(',')
    };

    elements.grids.browse.innerHTML = '<div class="loading-skeleton"></div>';

    const data = await advancedSearch(params);

    if (data?.results) {
        renderAnimeGrid(elements.grids.browse, data.results);
        renderPagination(
            elements.pagination.browse,
            data.currentPage || page,
            data.hasNextPage,
            (newPage) => applyFilters(newPage)
        );
    }
}

async function showAnimeDetail(animeId) {
    showPage('detail');

    const info = await getAnimeInfo(animeId);
    if (!info) {
        showToast('Failed to load anime info', 'error');
        return;
    }

    state.currentAnime = info;
    state.currentEpisodes = info.episodes || [];

    elements.detail.backdrop.style.backgroundImage = `url(${info.image})`;
    elements.detail.poster.src = info.image;
    elements.detail.poster.alt = info.title;
    elements.detail.title.textContent = info.title;
    elements.detail.altTitle.textContent = info.otherName || '';

    elements.detail.meta.innerHTML = `
        ${info.type ? `<span>📺 ${info.type}</span>` : ''}
        ${info.status ? `<span>📡 ${info.status}</span>` : ''}
        ${info.totalEpisodes ? `<span>🎬 ${info.totalEpisodes} Episodes</span>` : ''}
        ${info.releaseDate ? `<span>📅 ${info.releaseDate}</span>` : ''}
        ${info.subOrDub ? `<span>🔊 ${info.subOrDub.toUpperCase()}</span>` : ''}
    `;

    elements.detail.genres.innerHTML = '';
    if (info.genres && info.genres.length > 0) {
        info.genres.forEach(genre => {
            const span = document.createElement('span');
            span.textContent = genre;
            elements.detail.genres.appendChild(span);
        });
    }

    elements.detail.description.textContent = info.description || 'No description available.';

    elements.detail.watchBtn.onclick = () => {
        if (info.episodes && info.episodes.length > 0) {
            playEpisode(info.episodes[0], 0, info);
        } else {
            showToast('No episodes available', 'error');
        }
    };

    renderEpisodes(elements.grids.episodes, info.episodes, (episode, index) => {
        playEpisode(episode, index, info);
    });
}

// ====================================
// Video Player
// ====================================

async function playEpisode(episode, index, animeInfo = null) {
    if (animeInfo) {
        state.currentAnime = animeInfo;
        state.currentEpisodes = animeInfo.episodes || [];
    }

    state.currentEpisodeIndex = index;
    showPage('player');

    elements.player.animeTitle.textContent = state.currentAnime?.title || 'Unknown Anime';
    elements.player.episodeTitle.textContent = `Episode ${episode.number || index + 1}${episode.title ? `: ${episode.title}` : ''}`;

    elements.player.prevBtn.disabled = index === 0;
    elements.player.nextBtn.disabled = index >= state.currentEpisodes.length - 1;

    renderEpisodes(elements.grids.playerEpisodes, state.currentEpisodes, (ep, idx) => {
        playEpisode(ep, idx);
    }, episode.id);

    await loadStreamingSources(episode.id);
}

async function loadStreamingSources(episodeId, server = 'hd-1', category = 'sub') {
    elements.player.loading.classList.remove('hidden');

    console.log('Loading sources for:', episodeId, 'server:', server, 'category:', category);
    let sources = await getStreamingSources(episodeId, server, category);

    // Try alternative servers if needed
    const servers = ['hd-1', 'hd-2', 'megacloud'];
    if (!sources || !sources.sources || sources.sources.length === 0) {
        for (const altServer of servers) {
            if (altServer === server) continue;
            console.log('Trying server:', altServer);
            sources = await getStreamingSources(episodeId, altServer, category);
            if (sources?.sources?.length > 0) {
                server = altServer;
                break;
            }
        }
    }

    // Try dub if sub fails
    if (!sources || !sources.sources || sources.sources.length === 0) {
        if (category === 'sub') {
            console.log('Trying dub category');
            sources = await getStreamingSources(episodeId, server, 'dub');
            if (sources?.sources?.length > 0) {
                category = 'dub';
            }
        }
    }

    if (!sources || !sources.sources || sources.sources.length === 0) {
        showToast('No streaming sources found. This episode may not be available yet.', 'error');
        elements.player.loading.classList.add('hidden');
        return;
    }

    state.currentEpisodeId = episodeId;
    state.currentServer = server;
    state.currentCategory = category;

    // Render server buttons
    elements.player.serverButtons.innerHTML = `
        <button class="server-btn ${server === 'hd-1' ? 'active' : ''}" onclick="changeServer('${episodeId}', 'hd-1', '${category}')">HD-1</button>
        <button class="server-btn ${server === 'hd-2' ? 'active' : ''}" onclick="changeServer('${episodeId}', 'hd-2', '${category}')">HD-2</button>
    `;

    // Add sub/dub toggle
    const categoryBtn = document.createElement('button');
    categoryBtn.className = 'server-btn' + (category === 'dub' ? ' active' : '');
    categoryBtn.textContent = category === 'sub' ? '🔊 SUB' : '🎤 DUB';
    categoryBtn.onclick = () => loadStreamingSources(episodeId, server, category === 'sub' ? 'dub' : 'sub');
    elements.player.serverButtons.appendChild(categoryBtn);

    // Render quality buttons
    elements.player.qualityButtons.innerHTML = '';
    sources.sources.forEach((source, idx) => {
        const btn = document.createElement('button');
        btn.className = 'quality-btn' + (idx === 0 ? ' active' : '');
        btn.textContent = source.quality || 'Auto';
        btn.onclick = () => playSource(source, btn);
        elements.player.qualityButtons.appendChild(btn);
    });

    // Play the first source
    playSource(sources.sources[0]);
}

function playSource(source, activeBtn = null) {
    const video = elements.player.video;

    // Clear previous HLS instance
    if (state.hlsPlayer) {
        state.hlsPlayer.destroy();
        state.hlsPlayer = null;
    }

    // Update quality button states
    if (activeBtn) {
        document.querySelectorAll('.quality-btn').forEach(btn => btn.classList.remove('active'));
        activeBtn.classList.add('active');
    }

    const sourceUrl = source.url;

    if (!sourceUrl) {
        showToast('Invalid video source URL', 'error');
        elements.player.loading.classList.add('hidden');
        return;
    }

    console.log('Playing source:', sourceUrl, 'type:', source.type);

    // Aniwatch sources are always HLS
    if (Hls.isSupported()) {
        state.hlsPlayer = new Hls({
            debug: false,
            enableWorker: true,
            lowLatencyMode: true,
            maxBufferLength: 30,
            maxMaxBufferLength: 60
        });

        state.hlsPlayer.loadSource(sourceUrl);
        state.hlsPlayer.attachMedia(video);

        state.hlsPlayer.on(Hls.Events.MANIFEST_PARSED, () => {
            elements.player.loading.classList.add('hidden');
            video.play().catch(e => {
                console.log('Autoplay prevented:', e);
                showToast('Click the video to start playing', 'info');
                elements.player.loading.classList.add('hidden');
            });
        });

        state.hlsPlayer.on(Hls.Events.ERROR, (event, data) => {
            console.error('HLS Error:', data);
            if (data.fatal) {
                switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                        console.log('Network error, trying to recover...');
                        state.hlsPlayer.startLoad();
                        break;
                    case Hls.ErrorTypes.MEDIA_ERROR:
                        console.log('Media error, trying to recover...');
                        state.hlsPlayer.recoverMediaError();
                        break;
                    default:
                        showToast('Video playback error. Try another server.', 'error');
                        elements.player.loading.classList.add('hidden');
                        break;
                }
            }
        });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari native HLS support
        video.src = sourceUrl;
        video.addEventListener('loadedmetadata', () => {
            elements.player.loading.classList.add('hidden');
            video.play().catch(e => console.log('Autoplay prevented:', e));
        }, { once: true });
        video.addEventListener('error', () => {
            showToast('Video playback error. Try another server.', 'error');
            elements.player.loading.classList.add('hidden');
        }, { once: true });
    } else {
        showToast('Your browser does not support HLS playback', 'error');
        elements.player.loading.classList.add('hidden');
    }
}

function changeServer(episodeId, server, category) {
    loadStreamingSources(episodeId, server, category);
}

function playPrevEpisode() {
    if (state.currentEpisodeIndex > 0) {
        const prevEpisode = state.currentEpisodes[state.currentEpisodeIndex - 1];
        playEpisode(prevEpisode, state.currentEpisodeIndex - 1);
    }
}

function playNextEpisode() {
    if (state.currentEpisodeIndex < state.currentEpisodes.length - 1) {
        const nextEpisode = state.currentEpisodes[state.currentEpisodeIndex + 1];
        playEpisode(nextEpisode, state.currentEpisodeIndex + 1);
    }
}

// ====================================
// Search Suggestions
// ====================================

let searchDebounce = null;

function setupSearchListeners() {
    elements.search.input.addEventListener('input', (e) => {
        clearTimeout(searchDebounce);
        const query = e.target.value.trim();

        if (query.length < 2) {
            elements.search.suggestions.classList.remove('active');
            return;
        }

        searchDebounce = setTimeout(async () => {
            const data = await getSearchSuggestions(query);
            renderSearchSuggestions(data?.suggestions || []);
        }, 300);
    });

    elements.search.input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // Close suggestions on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            elements.search.suggestions.classList.remove('active');
        }
    });
}

function renderSearchSuggestions(suggestions) {
    if (!suggestions || suggestions.length === 0) {
        elements.search.suggestions.classList.remove('active');
        return;
    }

    elements.search.suggestions.innerHTML = '';

    suggestions.slice(0, 8).forEach(anime => {
        const item = document.createElement('div');
        item.className = 'suggestion-item';
        item.innerHTML = `
            <img src="${anime.image}" alt="${anime.title}" loading="lazy" onerror="this.src='https://via.placeholder.com/50x70?text=?'">
            <div class="suggestion-info">
                <h4>${anime.title}</h4>
                <span>${anime.releaseDate || ''}</span>
            </div>
        `;
        item.onclick = () => {
            elements.search.suggestions.classList.remove('active');
            showAnimeDetail(anime.id);
        };
        elements.search.suggestions.appendChild(item);
    });

    elements.search.suggestions.classList.add('active');
}

// ====================================
// Genre Selection
// ====================================

function setupGenreButtons() {
    document.querySelectorAll('.genre-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const genre = btn.dataset.genre;

            if (btn.classList.contains('active')) {
                btn.classList.remove('active');
                state.selectedGenres = state.selectedGenres.filter(g => g !== genre);
            } else {
                btn.classList.add('active');
                state.selectedGenres.push(genre);
            }
        });
    });
}

// ====================================
// Mobile Menu
// ====================================

function toggleMobileMenu() {
    elements.mobileMenu.classList.toggle('active');
}

// ====================================
// Toast Notifications
// ====================================

function showToast(message, type = 'info') {
    elements.toastMessage.textContent = message;
    elements.toast.className = 'toast active ' + type;

    setTimeout(() => {
        elements.toast.classList.remove('active');
    }, 3000);
}

// ====================================
// Initialization
// ====================================

async function init() {
    console.log('🚀 PrimeXStream initialized with Aniwatch API');

    setupSearchListeners();
    setupGenreButtons();

    // Load homepage data
    await showHome();

    // Make functions globally available
    window.showHome = showHome;
    window.showCategory = showCategory;
    window.showAdvancedSearch = showAdvancedSearch;
    window.performSearch = performSearch;
    window.applyFilters = applyFilters;
    window.showAnimeDetail = showAnimeDetail;
    window.playEpisode = playEpisode;
    window.playPrevEpisode = playPrevEpisode;
    window.playNextEpisode = playNextEpisode;
    window.changeServer = changeServer;
    window.toggleMobileMenu = toggleMobileMenu;
}

// Start the application
document.addEventListener('DOMContentLoaded', init);
