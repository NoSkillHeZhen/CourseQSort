
var CourseQSortAPI = (function () {
    'use strict';

    // ======================== 配置 ========================

    var CONFIG = {
        BASE_URL: 'http://8.163.73.251:8000/api/v1',
        USE_MOCK: true,
        LOGIN_MODE: 'mock',
    };

    function setMockMode(val) {
        CONFIG.USE_MOCK = val;
        console.log('[API] Mock mode:', val);
    }

    function setBaseUrl(url) { CONFIG.BASE_URL = url; }
    function isMockMode() { return CONFIG.USE_MOCK; }
    function getBaseUrl() { return CONFIG.BASE_URL; }

    // ======================== Token 管理 ========================

    var TOKEN_KEYS = {
        ACCESS: 'cqs_access_token',
        REFRESH: 'cqs_refresh_token',
    };

    // 页面加载时从 localStorage 恢复 JWT 模式（防止页面跳转后 CONFIG 复位导致误判未登录）
    // 优先读取 sessionStorage 中用户手动选择的登录模式
    var savedMode = sessionStorage.getItem('loginMode');
    if (savedMode) {
        CONFIG.LOGIN_MODE = savedMode;
        CONFIG.USE_MOCK = (savedMode !== 'jwt');
    } else if (localStorage.getItem(TOKEN_KEYS.ACCESS)) {
        CONFIG.LOGIN_MODE = 'jwt';
        CONFIG.USE_MOCK = false;
    }
    console.log('[INIT] USE_MOCK=' + CONFIG.USE_MOCK + ' LOGIN_MODE=' + CONFIG.LOGIN_MODE + ' token=' + !!localStorage.getItem(TOKEN_KEYS.ACCESS));

    function getAccessToken() { return localStorage.getItem(TOKEN_KEYS.ACCESS); }
    function getRefreshToken() { return localStorage.getItem(TOKEN_KEYS.REFRESH); }

    function setTokens(access, refresh) {
        if (access) localStorage.setItem(TOKEN_KEYS.ACCESS, access);
        if (refresh) localStorage.setItem(TOKEN_KEYS.REFRESH, refresh);
        CONFIG.LOGIN_MODE = 'jwt';
        CONFIG.USE_MOCK = false;
        sessionStorage.setItem('loginMode', 'jwt');
    }

    function clearTokens() {
        localStorage.removeItem(TOKEN_KEYS.ACCESS);
        localStorage.removeItem(TOKEN_KEYS.REFRESH);
    }

    function isAuthenticated() {
        // JWT token 存在 → 已通过后端验证
        if (getAccessToken()) return true;
        // 预览模式兼容：检查 sessionStorage 中的用户信息
        if (sessionStorage.getItem('studentName')) return true;
        if (sessionStorage.getItem('teacherName')) return true;
        if (sessionStorage.getItem('adminName')) return true;
        return false;
    }

    function getLoginMode() { return CONFIG.LOGIN_MODE; }
    function setLoginMode(mode) {
        CONFIG.LOGIN_MODE = mode;
        CONFIG.USE_MOCK = (mode !== 'jwt');
        sessionStorage.setItem('loginMode', mode);
    }

    // ======================== 核心 HTTP 请求 ========================

    async function apiCall(method, path, body, opts) {
        opts = opts || {};

        if (CONFIG.USE_MOCK) {
            console.log('[API] mock mode, path=' + path + ' body=', body);
            return mockResponse(method, path, body);
        }

        var url = CONFIG.BASE_URL + path;
        console.log('[API] fetch ' + method + ' ' + url);
        var isFormData = opts.isFormData || (body instanceof FormData);
        var headers = isFormData ? {} : { 'Content-Type': 'application/json' };

        var token = getAccessToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;

        var fetchOpts = {
            method: method,
            headers: headers,
        };
        if (body && method !== 'GET') {
            fetchOpts.body = isFormData ? body : JSON.stringify(body);
        }

        try {
            var resp = await fetch(url, fetchOpts);
            console.log('[API] response status=' + resp.status + ' ok=' + resp.ok);

            if (resp.status === 401 && getRefreshToken()) {
                var refreshed = await refreshAccessToken();
                if (refreshed) {
                    headers['Authorization'] = 'Bearer ' + getAccessToken();
                    resp = await fetch(url, fetchOpts);
                } else {
                    clearTokens();
                    CONFIG.LOGIN_MODE = 'mock';
                    window.location.href = 'index.html';
                    throw new Error('Session expired');
                }
            }

            if (!resp.ok && !opts.noThrow) {
                var errData = null;
                try { errData = await resp.json(); } catch (e) { }
                var err = new Error('API Error: ' + resp.status);
                err.status = resp.status;
                err.data = errData;
                throw err;
            }

            if (resp.status === 204) return null;
            return await resp.json();

        } catch (err) {
            console.error('[API] catch error: name=' + err.name + ' message=' + err.message + ' status=' + err.status + ' data=' + JSON.stringify(err.data));
            if (err.name === 'TypeError' && err.message.includes('fetch')) {
                // 只有 mock 模式才静默回退，后端模式抛出错误让调用方处理
                if (CONFIG.USE_MOCK) {
                    console.warn('[API] Backend unreachable, falling back to mock');
                    return mockResponse(method, path, body);
                }
                console.error('[API] Backend unreachable in JWT mode');
            }
            throw err;
        }
    }

    async function refreshAccessToken() {
        var refreshToken = getRefreshToken();
        if (!refreshToken) return false;
        try {
            var resp = await fetch(CONFIG.BASE_URL + '/auth/refresh/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refresh: refreshToken })
            });
            if (resp.ok) {
                var data = await resp.json();
                setTokens(data.access, refreshToken);
                return true;
            }
        } catch (e) { }
        return false;
    }

    // ======================== Mock 响应引擎 ========================

    var mockCallbacks = {};

    function registerMock(method, path, handler) {
        var key = method + ':' + path;
        mockCallbacks[key] = handler;
    }

    function registerMockPattern(method, pattern, handler) {
        var key = method + ':pattern:' + pattern;
        mockCallbacks[key] = handler;
    }

    function parseQueryString(str) {
        var params = {};
        if (!str) return params;
        str.split('&').forEach(function (pair) {
            var parts = pair.split('=');
            if (parts[0]) params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
        });
        return params;
    }

    function mockResponse(method, path, body) {
        var pathOnly = path.split('?')[0];
        var queryParams = parseQueryString(path.split('?')[1] || '');
        // GET/DELETE 传 queryParams，POST/PUT/PATCH 传 body
        var handlerArg = (method === 'GET' || method === 'DELETE') ? queryParams : body;

        var key = method + ':' + pathOnly;
        if (mockCallbacks[key]) {
            return Promise.resolve(mockCallbacks[key](handlerArg));
        }

        for (var mk in mockCallbacks) {
            if (mk.indexOf(':pattern:') === -1) continue;
            var parts = mk.split(':pattern:');
            var patternMethod = parts[0];
            var pattern = parts[1];
            if (patternMethod !== method) continue;
            if (matchPath(pathOnly, pattern)) {
                var matchedId = extractId(pathOnly, pattern);
                return Promise.resolve(mockCallbacks[mk](handlerArg, matchedId));
            }
        }

        console.warn('[API] No mock handler for:', method, pathOnly);
        return Promise.resolve(null);
    }

    var PLACEHOLDER_RE = /^\{.+}$/;

    function matchPath(path, pattern) {
        var parts = path.split('/').filter(Boolean);
        var patParts = pattern.split('/').filter(Boolean);
        if (parts.length !== patParts.length) return false;
        for (var i = 0; i < parts.length; i++) {
            if (PLACEHOLDER_RE.test(patParts[i])) continue;
            if (parts[i] !== patParts[i]) return false;
        }
        return true;
    }

    function extractId(path, pattern) {
        var parts = path.split('/').filter(Boolean);
        var patParts = pattern.split('/').filter(Boolean);
        var result = {};
        for (var i = 0; i < parts.length; i++) {
            if (PLACEHOLDER_RE.test(patParts[i])) {
                var name = patParts[i].slice(1, -1);
                result[name] = parts[i];
            }
        }
        return result;
    }

    // ======================== Mock 数据 ========================

    var MOCK_COURSES = [
        { course_id: 1, name: "高等数学AAAA", credit: 5, teacher: "张教授", capacity: 180, enrolled_count: 150, time_slots: [{ day_of_week: 1, period: 1 }, { day_of_week: 1, period: 2 }, { day_of_week: 3, period: 1 }, { day_of_week: 3, period: 2 }], is_professional: true, category: "专必" },
        { course_id: 2, name: "大学英语Ⅱ", credit: 4, teacher: "李老师", capacity: 160, enrolled_count: 140, time_slots: [{ day_of_week: 2, period: 3 }, { day_of_week: 2, period: 4 }, { day_of_week: 4, period: 3 }, { day_of_week: 4, period: 4 }], is_professional: true, category: "专必" },
        { course_id: 3, name: "线性代数", credit: 3, teacher: "王教授", capacity: 150, enrolled_count: 130, time_slots: [{ day_of_week: 3, period: 5 }, { day_of_week: 3, period: 6 }, { day_of_week: 5, period: 5 }], is_professional: true, category: "专必" },
        { course_id: 4, name: "马克思主义原理", credit: 2, teacher: "陈老师", capacity: 200, enrolled_count: 120, time_slots: [{ day_of_week: 1, period: 7 }, { day_of_week: 1, period: 8 }], is_professional: true, category: "专必" },
        { course_id: 5, name: "体育(二)", credit: 1, teacher: "刘教练", capacity: 60, enrolled_count: 40, time_slots: [{ day_of_week: 5, period: 9 }, { day_of_week: 5, period: 10 }], is_professional: false, category: "通识" },
        { course_id: 6, name: "数据结构", credit: 4, teacher: "赵教授", capacity: 100, enrolled_count: 80, time_slots: [{ day_of_week: 1, period: 3 }, { day_of_week: 1, period: 4 }, { day_of_week: 3, period: 3 }, { day_of_week: 3, period: 4 }], is_professional: true, category: "专必" },
        { course_id: 7, name: "计算机组成原理", credit: 4, teacher: "孙老师", capacity: 120, enrolled_count: 90, time_slots: [{ day_of_week: 2, period: 1 }, { day_of_week: 2, period: 2 }, { day_of_week: 4, period: 1 }, { day_of_week: 4, period: 2 }], is_professional: true, category: "专必" },
        { course_id: 8, name: "操作系统", credit: 4, teacher: "周教授", capacity: 100, enrolled_count: 70, time_slots: [{ day_of_week: 1, period: 5 }, { day_of_week: 1, period: 6 }, { day_of_week: 3, period: 7 }, { day_of_week: 3, period: 8 }], is_professional: true, category: "专必" },
        { course_id: 9, name: "数据库原理", credit: 3, teacher: "吴老师", capacity: 110, enrolled_count: 85, time_slots: [{ day_of_week: 2, period: 5 }, { day_of_week: 2, period: 6 }, { day_of_week: 4, period: 5 }], is_professional: true, category: "专必" },
        { course_id: 10, name: "概率论与数理统计", credit: 3, teacher: "郑教授", capacity: 130, enrolled_count: 110, time_slots: [{ day_of_week: 3, period: 9 }, { day_of_week: 3, period: 10 }, { day_of_week: 5, period: 1 }, { day_of_week: 5, period: 2 }], is_professional: true, category: "专必" },
        { course_id: 11, name: "Python程序设计", credit: 3, teacher: "王老师", capacity: 90, enrolled_count: 60, time_slots: [{ day_of_week: 2, period: 7 }, { day_of_week: 2, period: 8 }, { day_of_week: 4, period: 7 }], is_professional: false, category: "专选" },
        { course_id: 12, name: "Java语言", credit: 3, teacher: "李老师", capacity: 80, enrolled_count: 70, time_slots: [{ day_of_week: 1, period: 9 }, { day_of_week: 1, period: 10 }, { day_of_week: 3, period: 9 }], is_professional: false, category: "专选" },
        { course_id: 13, name: "人工智能导论", credit: 2, teacher: "刘教授", capacity: 120, enrolled_count: 40, time_slots: [{ day_of_week: 5, period: 6 }, { day_of_week: 5, period: 7 }], is_professional: false, category: "专选" },
        { course_id: 14, name: "机器学习", credit: 3, teacher: "陈老师", capacity: 100, enrolled_count: 50, time_slots: [{ day_of_week: 2, period: 9 }, { day_of_week: 2, period: 10 }, { day_of_week: 4, period: 8 }], is_professional: false, category: "专选" },
        { course_id: 15, name: "数字逻辑", credit: 3, teacher: "张老师", capacity: 90, enrolled_count: 75, time_slots: [{ day_of_week: 1, period: 3 }, { day_of_week: 1, period: 4 }, { day_of_week: 3, period: 3 }], is_professional: true, category: "专必" },
        { course_id: 16, name: "离散数学", credit: 3, teacher: "赵老师", capacity: 110, enrolled_count: 95, time_slots: [{ day_of_week: 2, period: 3 }, { day_of_week: 2, period: 4 }, { day_of_week: 4, period: 3 }], is_professional: true, category: "专必" },
        { course_id: 17, name: "计算机网络", credit: 3, teacher: "孙教授", capacity: 100, enrolled_count: 80, time_slots: [{ day_of_week: 3, period: 1 }, { day_of_week: 3, period: 2 }, { day_of_week: 5, period: 3 }], is_professional: true, category: "专必" },
        { course_id: 18, name: "软件工程", credit: 2, teacher: "周老师", capacity: 100, enrolled_count: 90, time_slots: [{ day_of_week: 4, period: 9 }, { day_of_week: 4, period: 10 }], is_professional: false, category: "专选" },
        { course_id: 19, name: "编译原理", credit: 3, teacher: "吴教授", capacity: 80, enrolled_count: 55, time_slots: [{ day_of_week: 5, period: 1 }, { day_of_week: 5, period: 2 }, { day_of_week: 5, period: 3 }], is_professional: true, category: "专必" },
        { course_id: 20, name: "网络安全", credit: 2, teacher: "郑老师", capacity: 80, enrolled_count: 30, time_slots: [{ day_of_week: 1, period: 8 }, { day_of_week: 1, period: 9 }], is_professional: false, category: "专选" },
        { course_id: 21, name: "数字图像处理", credit: 2, teacher: "王老师", capacity: 70, enrolled_count: 50, time_slots: [{ day_of_week: 2, period: 1 }, { day_of_week: 2, period: 2 }], is_professional: false, category: "专选" },
        { course_id: 22, name: "嵌入式系统", credit: 2, teacher: "李老师", capacity: 60, enrolled_count: 45, time_slots: [{ day_of_week: 3, period: 5 }, { day_of_week: 3, period: 6 }], is_professional: false, category: "专选" },
        { course_id: 23, name: "云计算概论", credit: 2, teacher: "刘老师", capacity: 100, enrolled_count: 20, time_slots: [{ day_of_week: 4, period: 5 }, { day_of_week: 4, period: 6 }], is_professional: false, category: "专选" },
        { course_id: 24, name: "大数据技术", credit: 3, teacher: "陈教授", capacity: 90, enrolled_count: 60, time_slots: [{ day_of_week: 5, period: 7 }, { day_of_week: 5, period: 8 }, { day_of_week: 5, period: 9 }], is_professional: false, category: "专选" },
        { course_id: 25, name: "算法设计与分析", credit: 3, teacher: "张教授", capacity: 80, enrolled_count: 65, time_slots: [{ day_of_week: 1, period: 5 }, { day_of_week: 1, period: 6 }, { day_of_week: 3, period: 7 }], is_professional: true, category: "专必" },
        { course_id: 26, name: "移动应用开发", credit: 2, teacher: "孙老师", capacity: 70, enrolled_count: 30, time_slots: [{ day_of_week: 2, period: 7 }, { day_of_week: 2, period: 8 }], is_professional: false, category: "专选" },
        { course_id: 27, name: "游戏引擎原理", credit: 2, teacher: "周老师", capacity: 50, enrolled_count: 20, time_slots: [{ day_of_week: 4, period: 1 }, { day_of_week: 4, period: 2 }], is_professional: false, category: "专选" },
        { course_id: 28, name: "信息检索", credit: 2, teacher: "吴老师", capacity: 60, enrolled_count: 40, time_slots: [{ day_of_week: 3, period: 10 }, { day_of_week: 3, period: 11 }], is_professional: false, category: "专选" },
        { course_id: 29, name: "计算机图形学", credit: 3, teacher: "郑老师", capacity: 70, enrolled_count: 50, time_slots: [{ day_of_week: 1, period: 10 }, { day_of_week: 1, period: 11 }, { day_of_week: 3, period: 11 }], is_professional: false, category: "专选" },
        { course_id: 30, name: "模式识别", credit: 2, teacher: "王教授", capacity: 80, enrolled_count: 35, time_slots: [{ day_of_week: 2, period: 11 }, { day_of_week: 4, period: 11 }], is_professional: false, category: "专选" },
        { course_id: 31, name: "数据挖掘", credit: 2, teacher: "李教授", capacity: 90, enrolled_count: 40, time_slots: [{ day_of_week: 5, period: 1 }, { day_of_week: 5, period: 2 }], is_professional: false, category: "专选" },
        { course_id: 32, name: "自然语言处理", credit: 2, teacher: "刘老师", capacity: 80, enrolled_count: 50, time_slots: [{ day_of_week: 3, period: 1 }, { day_of_week: 3, period: 2 }], is_professional: false, category: "专选" },
        { course_id: 33, name: "计算机视觉", credit: 2, teacher: "陈老师", capacity: 70, enrolled_count: 30, time_slots: [{ day_of_week: 4, period: 7 }, { day_of_week: 4, period: 8 }], is_professional: false, category: "专选" },
        { course_id: 34, name: "物联网导论", credit: 2, teacher: "张老师", capacity: 60, enrolled_count: 45, time_slots: [{ day_of_week: 1, period: 1 }, { day_of_week: 1, period: 2 }], is_professional: false, category: "专选" },
        { course_id: 35, name: "区块链技术", credit: 2, teacher: "孙老师", capacity: 50, enrolled_count: 40, time_slots: [{ day_of_week: 2, period: 5 }, { day_of_week: 2, period: 6 }], is_professional: false, category: "专选" },
        { course_id: 36, name: "量化交易", credit: 2, teacher: "周老师", capacity: 40, enrolled_count: 30, time_slots: [{ day_of_week: 3, period: 5 }, { day_of_week: 3, period: 6 }], is_professional: false, category: "专选" },
        { course_id: 37, name: "经济学原理", credit: 3, teacher: "吴教授", capacity: 120, enrolled_count: 100, time_slots: [{ day_of_week: 5, period: 3 }, { day_of_week: 5, period: 4 }, { day_of_week: 5, period: 5 }], is_professional: false, category: "通识" },
        { course_id: 38, name: "管理学", credit: 2, teacher: "郑教授", capacity: 100, enrolled_count: 80, time_slots: [{ day_of_week: 4, period: 9 }, { day_of_week: 4, period: 10 }], is_professional: false, category: "通识" },
        { course_id: 39, name: "书法鉴赏", credit: 1, teacher: "刘老师", capacity: 40, enrolled_count: 30, time_slots: [{ day_of_week: 1, period: 11 }], is_professional: false, category: "通识" },
        { course_id: 40, name: "影视鉴赏", credit: 1, teacher: "陈老师", capacity: 50, enrolled_count: 40, time_slots: [{ day_of_week: 2, period: 11 }], is_professional: false, category: "通识" },
        { course_id: 41, name: "音乐基础", credit: 1, teacher: "李老师", capacity: 45, enrolled_count: 35, time_slots: [{ day_of_week: 3, period: 11 }], is_professional: false, category: "通识" },
        { course_id: 42, name: "摄影技术", credit: 1, teacher: "王老师", capacity: 35, enrolled_count: 20, time_slots: [{ day_of_week: 4, period: 11 }], is_professional: false, category: "通识" },
        { course_id: 43, name: "书法实践", credit: 1, teacher: "张老师", capacity: 30, enrolled_count: 25, time_slots: [{ day_of_week: 5, period: 11 }], is_professional: false, category: "通识" },
        { course_id: 44, name: "心理学导论", credit: 2, teacher: "孙老师", capacity: 80, enrolled_count: 70, time_slots: [{ day_of_week: 1, period: 7 }, { day_of_week: 1, period: 8 }], is_professional: false, category: "通识" },
        { course_id: 45, name: "社会学概论", credit: 2, teacher: "周老师", capacity: 70, enrolled_count: 60, time_slots: [{ day_of_week: 2, period: 1 }, { day_of_week: 2, period: 2 }], is_professional: false, category: "通识" },
        { course_id: 46, name: "哲学入门", credit: 1, teacher: "吴老师", capacity: 50, enrolled_count: 30, time_slots: [{ day_of_week: 3, period: 3 }], is_professional: false, category: "通识" },
        { course_id: 47, name: "演讲与口才", credit: 1, teacher: "郑老师", capacity: 40, enrolled_count: 35, time_slots: [{ day_of_week: 4, period: 1 }], is_professional: false, category: "通识" },
        { course_id: 48, name: "时间管理", credit: 1, teacher: "刘老师", capacity: 60, enrolled_count: 50, time_slots: [{ day_of_week: 5, period: 2 }], is_professional: false, category: "通识" },
        { course_id: 49, name: "创新创意基础", credit: 2, teacher: "陈教授", capacity: 90, enrolled_count: 80, time_slots: [{ day_of_week: 1, period: 5 }, { day_of_week: 1, period: 6 }], is_professional: false, category: "通识" },
        { course_id: 50, name: "职业规划", credit: 1, teacher: "张老师", capacity: 80, enrolled_count: 60, time_slots: [{ day_of_week: 2, period: 9 }], is_professional: false, category: "通识" }
    ];

    var MOCK_MANDATORY_IDS = [1, 2, 3, 4, 5];

    var mockSelected = MOCK_MANDATORY_IDS.map(function (id) {
        var c = getCourseById(id);
        return {
            course_id: c.course_id,
            name: c.name,
            credit: c.credit,
            teacher: c.teacher,
            time_slots: JSON.parse(JSON.stringify(c.time_slots)),
            mandatory: true
        };
    });

    function getCourseById(id) {
        for (var i = 0; i < MOCK_COURSES.length; i++) {
            if (MOCK_COURSES[i].course_id === id) return MOCK_COURSES[i];
        }
        return null;
    }

    function buildBitmap(slotsArray) {
        var arr = new Array(55).fill('0');
        for (var i = 0; i < slotsArray.length; i++) {
            var s = slotsArray[i];
            var idx = (s.day_of_week - 1) * 11 + (s.period - 1);
            if (idx >= 0 && idx < 55) arr[idx] = '1';
        }
        return arr.join('');
    }

    function hasBitmapConflict(bm1, bm2) {
        for (var i = 0; i < bm1.length; i++) {
            if (bm1[i] === '1' && bm2[i] === '1') return true;
        }
        return false;
    }

    // ======================== 注册 Mock 处理器 ========================

    registerMock('POST', '/auth/register/', function (body) {
        // Mock 注册：模拟后端验证逻辑
        var name = body.name || '';
        var identifier = body.identifier || '';
        var role = body.role || 'STUDENT';
        var teacherId = null, teacherDept = null;
        if (role === 'STUDENT') {
            // 检查 mock 学生数据中是否有匹配的姓名+学号
            // 简单模拟：直接通过
        } else if (role === 'TEACHER') {
            // 检查 mock 教师数据
            var foundTeacher = MOCK_TEACHERS.find(function(t) {
                return t.name === name && t.employee_no === identifier;
            });
            if (!foundTeacher) {
                var err = new Error('未找到匹配的教师记录');
                err.status = 400;
                err.data = { identifier: ['未找到姓名为「' + name + '」且工号为「' + identifier + '」的教师记录'] };
                throw err;
            }
            teacherId = foundTeacher.id;
            teacherDept = foundTeacher.department || '';
        }
        return {
            access: 'mock_access_' + Date.now(),
            refresh: 'mock_refresh_' + Date.now(),
            user: { id: teacherId || (Date.now() % 10000), username: body.username, role: role, name: name, teacher_id: teacherId, teacher_dept: teacherDept },
            detail: '注册成功'
        };
    });

    registerMock('POST', '/auth/login/', function (body) {
        // Mock 登录：验证账号密码（预览模式下模拟真实行为）
        var username = (body.username || '').trim();
        var password = (body.password || '').trim();
        if (!username || !password) {
            var err = new Error('用户名和密码不能为空');
            err.status = 400;
            err.data = { detail: '用户名和密码不能为空' };
            throw err;
        }
        // 模拟有效的账号列表
        var VALID_USERS = {
            'admin':    { password: 'admin123', role: 'ADMIN',   name: '教务管理员' },
            'teacher1': { password: 'teacher123', role: 'TEACHER', name: '张教授' },
            'teacher2': { password: 'teacher123', role: 'TEACHER', name: '李老师' },
            'student':  { password: 'student123', role: 'STUDENT', name: '测试同学' },
        };
        var user = VALID_USERS[username];
        if (!user) {
            var err = new Error('账号或密码错误');
            err.status = 401;
            err.data = { detail: '账号或密码错误' };
            throw err;
        }
        if (user.password !== password) {
            var err = new Error('账号或密码错误');
            err.status = 401;
            err.data = { detail: '账号或密码错误' };
            throw err;
        }
        // 校验角色是否匹配
        var reqRole = (body.role || '').toUpperCase();
        if (reqRole && user.role !== reqRole) {
            var err = new Error('该角色下不存在此账号');
            err.status = 401;
            err.data = { detail: '该角色下不存在此账号' };
            throw err;
        }
        // 查找教师/学生 id
        var teacherId = null, studentId = null, teacherDept = null;
        if (user.role === 'TEACHER') {
            var t = MOCK_TEACHERS.find(function(t){return t.name === user.name;});
            if (t) { teacherId = t.id; teacherDept = t.department || ''; }
        }
        return {
            access: 'mock_access_token_' + Date.now(),
            refresh: 'mock_refresh_token_' + Date.now(),
            user: {
                id: 1,
                username: username,
                role: user.role,
                name: user.name,
                email: 'test@university.edu.cn',
                major: '计算机科学与技术',
                teacher_id: teacherId,
                teacher_dept: teacherDept,
                student_id: studentId
            }
        };
    });

    registerMock('POST', '/auth/refresh/', function () {
        return { access: 'mock_refreshed_token_' + Date.now() };
    });

    registerMock('POST', '/auth/logout/', function () {
        return { detail: 'Successfully logged out' };
    });

    registerMock('GET', '/auth/me/', function () {
        return {
            id: 1, username: 'student', role: 'STUDENT',
            name: '测试同学', email: 'test@university.edu.cn',
            major: '计算机科学与技术'
        };
    });

    registerMock('GET', '/student/schedule/', function () {
        var bitmap = new Array(55).fill('0');
        mockSelected.forEach(function (sc) {
            var bm = buildBitmap(sc.time_slots).split('');
            for (var i = 0; i < 55; i++) {
                if (bm[i] === '1') bitmap[i] = '1';
            }
        });
        return {
            student_id: 2024001, semester: '2026-spring',
            bitmap: '0x' + bitmap.join(''),
            courses: mockSelected.map(function (sc) {
                var segments = sc.segments || [{
                    week_start: 1, week_end: 18,
                    time_slots: sc.time_slots,
                    classroom: sc.classroom || 'A101',
                    teacher: sc.teacher || ''
                }];
                return {
                    course_id: sc.course_id, name: sc.name,
                    credit: sc.credit,
                    teacher: sc.teacher, time_slots: sc.time_slots,
                    classroom: sc.classroom || 'A101', mandatory: sc.mandatory || false,
                    segments: segments
                };
            })
        };
    });
    registerMock('GET', '/student/courses/', function (queryParams) {
        return getMockCourseList(queryParams);
    });
    function getMockCourseList(params) {
        params = params || {};
        // 解析分页参数，并转为数字类型，设置默认值
        var page = parseInt(params.page, 10) || 1;
        var pageSize = parseInt(params.page_size, 10) || 15;  // 与前端 pageSize 一致

        // 构建完整课程列表（含冲突检测、剩余容量等）
        var results = MOCK_COURSES.map(function (c) {
            var isSelected = mockSelected.some(function (sc) { return sc.course_id === c.course_id; });
            var remaining = Math.max(0, c.capacity - c.enrolled_count);
            var conflict = false;
            var conflictWith = [];
            if (!isSelected) {
                var courseBm = buildBitmap(c.time_slots);
                for (var i = 0; i < mockSelected.length; i++) {
                    var scbm = buildBitmap(mockSelected[i].time_slots);
                    if (hasBitmapConflict(courseBm, scbm)) {
                        conflict = true;
                        conflictWith.push({
                            course_id: mockSelected[i].course_id,
                            name: mockSelected[i].name,
                            time_slots: mockSelected[i].time_slots
                        });
                    }
                }
            }
            // 从 time_slots 生成默认 segments（全部 1-18 周）
            var segs = [{
                week_start: 1, week_end: 18,
                time_slots: c.time_slots || [],
                classroom: '',
                teacher: c.teacher || ''
            }];
            return {
                course_id: c.course_id,
                name: c.name,
                credit: c.credit,
                teacher: c.teacher,
                capacity: c.capacity,
                enrolled_count: c.enrolled_count,
                remaining_capacity: remaining,
                time_slots: c.time_slots,
                conflict: conflict,
                conflict_with: conflictWith,
                category: c.category,
                is_professional: c.is_professional,
                mandatory: MOCK_MANDATORY_IDS.indexOf(c.course_id) !== -1,
                classroom: '',
                segments: segs
            };
        });

        // 计算分页数据
        var total = results.length;
        var start = (page - 1) * pageSize;
        var paged = results.slice(start, start + pageSize);

        // 构造返回对象（与后端接口格式一致）
        return {
            count: total,
            next: (start + pageSize < total) ? '/student/courses/?page=' + (page + 1) : null,
            previous: (page > 1) ? '/student/courses/?page=' + (page - 1) : null,
            results: paged
        };
    }

    registerMockPattern('GET', '/student/courses/{id}/conflict-detail/', function (body, vars) {
        var courseId = parseInt(vars.id);
        var course = getCourseById(courseId);
        if (!course) return {};
        var conflictCourses = [];
        var courseBm = buildBitmap(course.time_slots);
        mockSelected.forEach(function (sc) {
            var scBm = buildBitmap(sc.time_slots);
            if (hasBitmapConflict(courseBm, scBm)) {
                conflictCourses.push({
                    course_id: sc.course_id, name: sc.name,
                    teacher: sc.teacher,
                    day_of_week: sc.time_slots[0].day_of_week,
                    period: sc.time_slots[0].period,
                    classroom: 'A101', conflict_type: 'TIME_OVERLAP'
                });
            }
        });
        return {
            course_id: course.course_id, course_name: course.name,
            course_time_slots: course.time_slots,
            conflict_courses: conflictCourses,
            bitmap: '0x' + buildBitmap(course.time_slots),
            conflict_bitmap: '0x' + new Array(55).fill('0').join('')
        };
    });

    registerMockPattern('POST', '/student/courses/{id}/select/', function (body, vars) {
        var courseId = parseInt(vars.id);
        var course = getCourseById(courseId);
        if (!course) {
            var err = new Error('Course not found');
            err.status = 404; throw err;
        }
        var courseBm = buildBitmap(course.time_slots);
        for (var i = 0; i < mockSelected.length; i++) {
            var scBm = buildBitmap(mockSelected[i].time_slots);
            if (hasBitmapConflict(courseBm, scBm)) {
                var err = new Error('时间冲突');
                err.status = 409;
                err.data = { status: 'CONFLICT', message: '课程时间与已选课程冲突', conflict_detail: {} };
                throw err;
            }
        }
        if (course.enrolled_count >= course.capacity) {
            var err = new Error('容量已满');
            err.status = 409;
            err.data = { status: 'FULL', message: '该课程容量已满' };
            throw err;
        }
        course.enrolled_count++;
        mockSelected.push({
            course_id: course.course_id, name: course.name,
            credit: course.credit, teacher: course.teacher,
            time_slots: JSON.parse(JSON.stringify(course.time_slots)),
            mandatory: false
        });
        return { course_id: courseId, status: 'SELECTED', message: '选课成功' };
    });

    registerMockPattern('DELETE', '/student/courses/{id}/drop/', function (body, vars) {
        var courseId = parseInt(vars.id);
        var idx = -1;
        for (var i = 0; i < mockSelected.length; i++) {
            if (mockSelected[i].course_id === courseId) {
                if (mockSelected[i].mandatory) {
                    var err = new Error('必修课不可退');
                    err.status = 400; throw err;
                }
                idx = i; break;
            }
        }
        if (idx === -1) {
            var err = new Error('未选该课');
            err.status = 404; throw err;
        }
        mockSelected.splice(idx, 1);
        var course = getCourseById(courseId);
        if (course && course.enrolled_count > 0) course.enrolled_count--;
        return { course_id: courseId, status: 'DROPPED', message: '退课成功' };
    });

    registerMock('GET', '/student/free-slots/', function () {
        var bitmap = new Array(55).fill('0');
        mockSelected.forEach(function (sc) {
            var bm = buildBitmap(sc.time_slots).split('');
            for (var i = 0; i < 55; i++) { if (bm[i] === '1') bitmap[i] = '1'; }
        });
        var freeSlots = [];
        for (var i = 0; i < 55; i++) {
            if (bitmap[i] === '0') {
                freeSlots.push({ day_of_week: Math.floor(i / 11) + 1, period: (i % 11) + 1 });
            }
        }
        return { free_slots: freeSlots };
    });

    registerMockPattern('GET', '/student/free-slots/{day}/{period}/recommend/', function (body, vars) {
        var day = parseInt(vars.day);
        var period = parseInt(vars.period);
        var filtered = MOCK_COURSES.filter(function (c) {
            return c.time_slots.some(function (ts) { return ts.day_of_week === day && ts.period === period; });
        }).map(function (c) {
            return {
                course_id: c.course_id, name: c.name, credit: c.credit,
                category: c.category, satisfy_training_plan: true,
                remaining_capacity: Math.max(0, c.capacity - c.enrolled_count),
                teacher: c.teacher, classroom: '未分配',
                time_slots: c.time_slots
            };
        });
        return { day_of_week: day, period: period, courses: filtered };
    });

    // ======================== Admin Mock 数据 ========================

    var MOCK_TEACHERS = [
        { id: 1, name: "张教授", employee_no: "T001", department: "计算机学院", unavailable_slots: [{ day_of_week: 1, period: 1 }, { day_of_week: 1, period: 2 }] },
        { id: 2, name: "李老师", employee_no: "T002", department: "计算机学院", unavailable_slots: [] },
        { id: 3, name: "王教授", employee_no: "T003", department: "计算机学院", unavailable_slots: [] },
        { id: 4, name: "赵教授", employee_no: "T004", department: "数学学院", unavailable_slots: [] },
        { id: 5, name: "陈老师", employee_no: "T005", department: "外国语学院", unavailable_slots: [] },
    ];

    var MOCK_CLASSROOMS = [
        { id: 1, name: "A101", capacity: 120, building: "教学楼A", equipment_types: ["多媒体", "黑板"], is_lab: false },
        { id: 2, name: "A102", capacity: 100, building: "教学楼A", equipment_types: ["多媒体"], is_lab: false },
        { id: 3, name: "B201", capacity: 80, building: "教学楼B", equipment_types: ["多媒体", "黑板"], is_lab: false },
        { id: 4, name: "C301", capacity: 60, building: "实验楼C", equipment_types: ["电脑", "投影"], is_lab: true },
        { id: 5, name: "D101", capacity: 200, building: "教学楼D", equipment_types: ["多媒体", "音响"], is_lab: false },
    ];

    var MOCK_MAJORS = [
        { id: 1, name: "计算机科学与技术", code: "CS", student_count: 120 },
        { id: 2, name: "软件工程", code: "SE", student_count: 80 },
        { id: 3, name: "人工智能", code: "AI", student_count: 60 },
        { id: 4, name: "数学与应用数学", code: "MA", student_count: 90 },
        { id: 5, name: "英语", code: "EN", student_count: 70 },
    ];

    var MOCK_CLASS_GROUPS = [
        { id: 1, name: "计科2401", major: 1, major_name: "计算机科学与技术", grade: "2024" },
        { id: 2, name: "计科2402", major: 1, major_name: "计算机科学与技术", grade: "2024" },
        { id: 3, name: "软工2401", major: 2, major_name: "软件工程", grade: "2024" },
        { id: 4, name: "人工2301", major: 3, major_name: "人工智能", grade: "2023" },
        { id: 5, name: "计科2301", major: 1, major_name: "计算机科学与技术", grade: "2023" },
    ];

    var MOCK_STUDENTS = [
        { id: 1, student_no: "2024001", name: "张三", major: 1, major_name: "计算机科学与技术", grade: "2024", class_identification: "计科2401" },
        { id: 2, student_no: "2024002", name: "李四", major: 1, major_name: "计算机科学与技术", grade: "2024", class_identification: "计科2401" },
        { id: 3, student_no: "2024003", name: "王五", major: 2, major_name: "软件工程", grade: "2024", class_identification: "软工2401" },
        { id: 4, student_no: "2023001", name: "赵六", major: 1, major_name: "计算机科学与技术", grade: "2023", class_identification: "计科2302" },
        { id: 5, student_no: "2023002", name: "孙七", major: 3, major_name: "人工智能", grade: "2023", class_identification: "人工2301" },
    ];

    var MOCK_PROTECTED_SLOTS = [
        { id: 1, day_of_week: 2, start_period: 3, end_period: 4, penalty_weight: 8.0, description: "辅修热门时段-周二三四节" },
        { id: 2, day_of_week: 4, start_period: 5, end_period: 6, penalty_weight: 7.5, description: "辅修热门时段-周四五八节" },
    ];

    var MOCK_SCHEDULE_PLANS = [
        { id: 1, plan_name: "2026春-计算机学院-初版", semester: "2026-spring", status: "PUBLISHED", overall_fitness: 0.93, created_at: "2026-05-20T10:00:00Z", published_at: "2026-05-22T09:00:00Z" },
        { id: 2, plan_name: "2026春-计算机学院-修正版", semester: "2026-spring", status: "DRAFT", overall_fitness: 0.87, created_at: "2026-05-25T14:00:00Z", published_at: null },
    ];

    var MOCK_CONFLICT_RESULTS = [
        { id: 3, semester: "2026-spring", course_count: 50, conflict_pairs_count: 8, threshold: 30, created_at: "2026-07-19T16:30:00Z" },
        { id: 2, semester: "2026-spring", course_count: 50, conflict_pairs_count: 12, threshold: 20, created_at: "2026-06-15T10:00:00Z" },
        { id: 1, semester: "2026-spring", course_count: 50, conflict_pairs_count: 15, threshold: 30, created_at: "2026-05-21T14:00:00Z" },
    ];

    var MOCK_ALGORITHM_CONFIG = {
        variance_weight: 0.6, conflict_penalty_weight: 0.4,
        protected_slot_penalty: 8.0, population_size: 200,
        max_generations: 500, mutation_rate: 0.05,
        crossover_rate: 0.85, timeout_seconds: 300,
        period_groups: [[1, 4], [5, 8], [9, 12]],
        allow_cross_period: false,
        align_sessions: true,
        later_period_weight: 0.0,
        updated_at: "2026-05-20T10:30:00Z", updated_by: "张教务"
    };

    // ======================== Admin Mock 处理器 ========================

    registerMock('GET', '/admin/courses/', function (params) {
        var results = MOCK_COURSES.map(function (c) {
            return {
                id: c.course_id, name: c.name, code: c.code || '',
                credit: c.credit, hours: 48,
                major: MOCK_MAJORS[0],
                teachers: [{ id: 1, name: c.teacher }],
                required_classroom_types: ["多媒体"],
                expected_student_count: c.capacity,
                is_professional_course: c.is_professional,
                session_length: c.session_length || 2,
                semester: "2026-spring"
            };
        });
        // 支持 keyword 搜索
        if (params && params.keyword) {
            var kw = params.keyword.toLowerCase();
            results = results.filter(function(c) {
                return c.name.toLowerCase().indexOf(kw) !== -1 || (c.code || '').toLowerCase().indexOf(kw) !== -1;
            });
        }
        return { count: results.length, results: results };
    });

    var _mockCourseNextId = 100;
    registerMock('POST', '/admin/courses/', function (body) {
        var newId = _mockCourseNextId++;
        var majorId = body.major_id || 1;
        var majorObj = MOCK_MAJORS.find(function(m) { return m.id === majorId; }) || MOCK_MAJORS[0];
        var teacherIds = body.teacher_ids || [];
        var teachers = teacherIds.map(function(tid) {
            var t = MOCK_TEACHERS.find(function(x) { return x.id === tid; });
            return t ? { id: t.id, name: t.name } : { id: tid, name: '未知教师' };
        });
        var course = {
            id: newId, name: body.name || '', code: body.code || '',
            credit: body.credit || 0, hours: body.hours || 48,
            major: majorObj, teachers: teachers,
            required_classroom_types: body.required_classroom_types || ["多媒体"],
            expected_student_count: body.expected_student_count || 100,
            is_professional_course: body.is_professional_course !== false,
            session_length: body.session_length || 2,
            semester: body.semester || "2026-spring"
        };
        // 同时更新 MOCK_COURSES（保持兼容）
        MOCK_COURSES.push({
            course_id: newId, name: course.name, code: course.code,
            credit: course.credit, teacher: teachers.map(function(t){return t.name;}).join(', '),
            capacity: course.expected_student_count, enrolled_count: 0,
            session_length: course.session_length,
            time_slots: [], is_professional: course.is_professional_course,
            category: course.is_professional_course ? '专必' : '通识'
        });
        return course;
    });

    registerMockPattern('PATCH', '/admin/courses/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        // 更新 MOCK_COURSES 中的数据
        for (var i = 0; i < MOCK_COURSES.length; i++) {
            if (MOCK_COURSES[i].course_id === id) {
                if (body.name !== undefined) MOCK_COURSES[i].name = body.name;
                if (body.code !== undefined) MOCK_COURSES[i].code = body.code;
                if (body.credit !== undefined) MOCK_COURSES[i].credit = body.credit;
                if (body.expected_student_count !== undefined) MOCK_COURSES[i].capacity = body.expected_student_count;
                if (body.is_professional_course !== undefined) {
                    MOCK_COURSES[i].is_professional = body.is_professional_course;
                    MOCK_COURSES[i].category = body.is_professional_course ? '专必' : '通识';
                }
                if (body.session_length !== undefined) MOCK_COURSES[i].session_length = body.session_length;
                break;
            }
        }
        // 构建返回数据
        var majorId = body.major_id || 1;
        var majorObj = MOCK_MAJORS.find(function(m) { return m.id === majorId; }) || MOCK_MAJORS[0];
        return {
            id: id, name: body.name || '', code: body.code || '',
            credit: body.credit || 0, hours: body.hours || 48,
            major: majorObj, teachers: [],
            required_classroom_types: body.required_classroom_types || ["多媒体"],
            expected_student_count: body.expected_student_count || 100,
            is_professional_course: body.is_professional_course !== false,
            session_length: body.session_length || 2,
            semester: body.semester || "2026-spring"
        };
    });

    registerMockPattern('DELETE', '/admin/courses/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_COURSES.length;
        MOCK_COURSES = MOCK_COURSES.filter(function (c) { return c.course_id !== id; });
        if (MOCK_COURSES.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    // ---- 必修课分配 mock ----
    var _mockAssignments = [];
    var _mockAssignmentNextId = 1;

    registerMockPattern('POST', '/admin/courses/{id}/assign/', function (body, vars) {
        var courseId = parseInt(vars.id);
        var course = getCourseById(courseId);
        if (!course) { var err = new Error('Course not found'); err.status = 404; throw err; }

        var majorId = body.major_id || null;
        var grade = body.grade || '';
        var classId = body.class_identification || '';

        if (!majorId && !grade && !classId) {
            var err = new Error('至少需要指定专业、年级或班级之一');
            err.status = 400; err.data = { detail: '至少需要指定专业、年级或班级之一' };
            throw err;
        }

        // Mock: 查找匹配的学生
        var majorObj = majorId ? MOCK_MAJORS.find(function(m) { return m.id === majorId; }) : null;
        var mockStudentCount = majorObj ? (majorObj.student_count || 30) : 20;
        var assignedCount = Math.floor(mockStudentCount * 0.8);

        var assignment = {
            id: _mockAssignmentNextId++,
            course: courseId, major: majorId,
            major_name: majorObj ? majorObj.name : '',
            grade: grade, class_identification: classId,
            created_at: new Date().toISOString()
        };
        _mockAssignments.push(assignment);

        // 标记课程为必修
        if (MOCK_MANDATORY_IDS.indexOf(courseId) === -1) {
            MOCK_MANDATORY_IDS.push(courseId);
        }
        // 自动为学生选课
        var alreadySelected = mockSelected.some(function(sc) { return sc.course_id === courseId; });
        if (!alreadySelected) {
            mockSelected.push({
                course_id: course.course_id, name: course.name,
                credit: course.credit, teacher: course.teacher,
                time_slots: JSON.parse(JSON.stringify(course.time_slots)),
                mandatory: true
            });
        }

        return {
            assignment_id: assignment.id,
            created: true,
            total_matched: mockStudentCount,
            assigned_count: assignedCount,
            skipped_count: mockStudentCount - assignedCount,
            message: '成功为 ' + assignedCount + ' 名学生分配必修课「' + course.name + '」'
        };
    });

    registerMockPattern('GET', '/admin/courses/{id}/assignments/', function (body, vars) {
        var courseId = parseInt(vars.id);
        return _mockAssignments.filter(function(a) { return a.course === courseId; });
    });

    registerMockPattern('DELETE', '/admin/course-assignments/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = _mockAssignments.length;
        _mockAssignments = _mockAssignments.filter(function(a) { return a.id !== id; });
        if (_mockAssignments.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    registerMock('POST', '/admin/courses/import/', function (body) {
        // Mock JSON 导入：在预览模式下真正读取 JSON 文件
        var file = body.get('file');
        if (!file) {
            var err = new Error('No file provided');
            err.status = 400;
            throw err;
        }
        var slStr = body.get('session_length');
        var defaultSL = slStr ? parseInt(slStr) : 2;
        return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var data = JSON.parse(e.target.result);
                    // 支持嵌套 rows 格式
                    var records = [];
                    if (Array.isArray(data)) {
                        data.forEach(function (item) {
                            if (item && typeof item === 'object' && Array.isArray(item.rows)) {
                                records = records.concat(item.rows);
                            } else {
                                records.push(item);
                            }
                        });
                    } else if (data && Array.isArray(data.rows)) {
                        records = data.rows;
                    }

                    var addedCourses = 0;
                    var addedTeachers = 0;
                    var seenCourseIds = {};
                    var seenTeachers = {};

                    for (var i = 0; i < records.length; i++) {
                        var r = records[i];
                        if (!r || typeof r !== 'object') continue;
                        var cid = r.courseId;
                        if (cid && !seenCourseIds[cid]) {
                            seenCourseIds[cid] = true;
                            // 检查是否已存在
                            var exists = false;
                            for (var j = 0; j < MOCK_COURSES.length; j++) {
                                if (MOCK_COURSES[j].course_id === cid) { exists = true; break; }
                            }
                            if (!exists) {
                                var teacherNames = (r.teachingName || '').split(',').map(function(t){return t.trim();}).filter(Boolean);
                                var isPro = (r.courseCategoryName === '专必' || r.courseCategoryName === '专选');
                                var nextId = Math.max.apply(null, MOCK_COURSES.map(function(c){return c.course_id;})) + 1;
                                MOCK_COURSES.push({
                                    course_id: nextId,
                                    name: r.courseName || '',
                                    code: r.courseNum || '',
                                    credit: parseFloat(r.score) || 0,
                                    teacher: teacherNames.join(', '),
                                    capacity: parseInt(r.limitNumber) || 100,
                                    enrolled_count: 0,
                                    time_slots: [],
                                    is_professional: isPro,
                                    category: r.courseCategoryName || (isPro ? '专必' : '通识'),
                                    session_length: defaultSL
                                });
                                addedCourses++;
                                for (var k = 0; k < teacherNames.length; k++) {
                                    if (!seenTeachers[teacherNames[k]]) {
                                        seenTeachers[teacherNames[k]] = true;
                                        addedTeachers++;
                                    }
                                }
                            }
                        }
                    }

                    resolve({
                        imported_count: addedCourses,
                        total_records: records.length,
                        majors: 1,
                        teachers: addedTeachers,
                        classrooms: 1,
                        courses: addedCourses,
                        schedule_items: 0,
                        errors: []
                    });
                } catch (err) {
                    reject(err);
                }
            };
            reader.onerror = function () {
                reject(new Error('文件读取失败'));
            };
            reader.readAsText(file);
        });
    });

    registerMock('GET', '/admin/courses/export/', function () {
        // Mock 导出：将 MOCK_COURSES 序列化为 JSON
        var data = MOCK_COURSES.map(function (c) {
            return {
                id: c.course_id,
                courseId: String(c.course_id),
                courseName: c.name,
                courseNum: c.code || '',
                credit: c.credit,
                hours: c.hours || 48,
                semester: '2026-spring',
                campus: '',
                major: '',
                teachers: c.teacher ? c.teacher.split(',').map(function(t){return t.trim();}) : [],
                is_professional_course: c.is_professional || false,
                expected_student_count: c.capacity,
                session_length: c.session_length || 2
            };
        });
        return data;
    });

    registerMock('POST', '/admin/courses/batch_delete/', function (body) {
        var ids = body.ids || [];
        var before = MOCK_COURSES.length;
        MOCK_COURSES = MOCK_COURSES.filter(function (c) {
            return ids.indexOf(c.course_id) === -1;
        });
        return { deleted: before - MOCK_COURSES.length };
    });

    registerMock('POST', '/admin/courses/delete_all/', function (body) {
        // Mock 模式下任意非空密码都通过
        if (!body.password) {
            var err = new Error('请输入教务密码');
            err.status = 400;
            throw err;
        }
        var count = MOCK_COURSES.length;
        MOCK_COURSES = [];
        return { deleted: count };
    });

    registerMock('GET', '/admin/teachers/', function () {
        return { count: MOCK_TEACHERS.length, results: MOCK_TEACHERS };
    });

    registerMock('POST', '/admin/teachers/', function (body) {
        var newId = Math.max.apply(null, MOCK_TEACHERS.map(function(t){return t.id;})) + 1;
        var teacher = {
            id: newId,
            name: body.name || '',
            employee_no: body.employee_no || '',
            department: body.department || '',
            unavailable_slots: body.unavailable_slots || []
        };
        MOCK_TEACHERS.push(teacher);
        return teacher;
    });

    registerMockPattern('PATCH', '/admin/teachers/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_TEACHERS.length; i++) {
            if (MOCK_TEACHERS[i].id === id) {
                if (body.name !== undefined) MOCK_TEACHERS[i].name = body.name;
                if (body.employee_no !== undefined) MOCK_TEACHERS[i].employee_no = body.employee_no;
                if (body.department !== undefined) MOCK_TEACHERS[i].department = body.department;
                if (body.unavailable_slots !== undefined) MOCK_TEACHERS[i].unavailable_slots = body.unavailable_slots;
                return MOCK_TEACHERS[i];
            }
        }
        var err = new Error('Not found'); err.status = 404; throw err;
    });

    registerMockPattern('DELETE', '/admin/teachers/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_TEACHERS.length;
        MOCK_TEACHERS = MOCK_TEACHERS.filter(function (t) { return t.id !== id; });
        if (MOCK_TEACHERS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    // ---- 教师 导入/导出 mock ----
    // ---- 通用导入辅助：从 FormData 中读取 JSON 文件 ----
    function parseImportFormData(body) {
        return new Promise(function (resolve, reject) {
            var file = body.get('file');
            if (!file) { resolve([]); return; }
            var reader = new FileReader();
            reader.onload = function () {
                try {
                    var data = JSON.parse(reader.result);
                    if (Array.isArray(data)) resolve(data);
                    else if (data && Array.isArray(data.rows)) resolve(data.rows);
                    else resolve([data]);
                } catch (e) { reject(new Error('JSON 解析失败')); }
            };
            reader.onerror = function () { reject(new Error('文件读取失败')); };
            reader.readAsText(file);
        });
    }

    registerMock('GET', '/admin/teachers/export/', function () {
        return MOCK_TEACHERS.map(function (t) {
            return { name: t.name, employee_no: t.employee_no, department: t.department, unavailable_slots: t.unavailable_slots || [] };
        });
    });
    registerMock('POST', '/admin/teachers/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_TEACHERS.some(function (t) { return t.name === r.name; });
                if (!exists && r.name) {
                    MOCK_TEACHERS.push({
                        id: Math.max.apply(null, MOCK_TEACHERS.map(function(t){return t.id;}).concat([0])) + 1,
                        name: r.name, employee_no: r.employee_no || '', department: r.department || '', unavailable_slots: r.unavailable_slots || []
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 教室 导入/导出 mock ----
    registerMock('GET', '/admin/classrooms/export/', function () {
        return MOCK_CLASSROOMS.map(function (r) {
            return { name: r.name, capacity: r.capacity, building: r.building, is_lab: r.is_lab, equipment_types: r.equipment_types || [] };
        });
    });
    registerMock('POST', '/admin/classrooms/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_CLASSROOMS.some(function (cr) { return cr.name === r.name && cr.building === r.building; });
                if (!exists && r.name) {
                    MOCK_CLASSROOMS.push({
                        id: Math.max.apply(null, MOCK_CLASSROOMS.map(function(c){return c.id;}).concat([0])) + 1,
                        name: r.name, capacity: r.capacity || 60, building: r.building || '', is_lab: r.is_lab || false, equipment_types: r.equipment_types || []
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 学生 导入/导出 mock ----
    registerMock('GET', '/admin/students/export/', function () {
        return MOCK_STUDENTS.map(function (s) {
            return { student_no: s.student_no, name: s.name, grade: s.grade, major_name: s.major_name || '', class_identification: s.class_identification || '', class_group_name: s.class_name || '' };
        });
    });
    registerMock('POST', '/admin/students/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_STUDENTS.some(function (s) { return s.student_no === r.student_no; });
                if (!exists && r.student_no) {
                    MOCK_STUDENTS.push({
                        id: Math.max.apply(null, MOCK_STUDENTS.map(function(s){return s.id;}).concat([0])) + 1,
                        student_no: r.student_no, name: r.name, grade: r.grade || '', major_name: r.major_name || '', class_identification: r.class_identification || '', class_name: r.class_group_name || ''
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 专业 导入/导出 mock ----
    registerMock('GET', '/admin/majors/export/', function () {
        return MOCK_MAJORS.map(function (m) {
            return { name: m.name, code: m.code || '', student_count: m.student_count };
        });
    });
    registerMock('POST', '/admin/majors/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_MAJORS.some(function (m) { return m.name === r.name; });
                if (!exists && r.name) {
                    MOCK_MAJORS.push({
                        id: Math.max.apply(null, MOCK_MAJORS.map(function(m){return m.id;}).concat([0])) + 1,
                        name: r.name, code: r.code || '', student_count: r.student_count || 0
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 班级 导入/导出 mock ----
    registerMock('GET', '/admin/class-groups/export/', function () {
        return MOCK_CLASS_GROUPS.map(function (g) {
            return { name: g.name, grade: g.grade, major_name: g.major_name || '' };
        });
    });
    registerMock('POST', '/admin/class-groups/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_CLASS_GROUPS.some(function (g) { return g.name === r.name; });
                if (!exists && r.name) {
                    MOCK_CLASS_GROUPS.push({
                        id: Math.max.apply(null, MOCK_CLASS_GROUPS.map(function(g){return g.id;}).concat([0])) + 1,
                        name: r.name, grade: r.grade || '', major_name: r.major_name || ''
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 必修分配 导入/导出 mock ----
    registerMock('GET', '/admin/course-assignments/', function () {
        return { count: MOCK_COURSE_ASSIGNMENTS.length, results: MOCK_COURSE_ASSIGNMENTS };
    });
    registerMock('GET', '/admin/course-assignments/export/', function () {
        return MOCK_COURSE_ASSIGNMENTS.map(function (a) {
            return { course_name: a.course_name || '', major_name: a.major_name || '', grade: a.grade, class_identification: a.class_identification };
        });
    });
    registerMock('POST', '/admin/course-assignments/import_json/', function (body) {
        return parseImportFormData(body).then(function (records) {
            var created = 0;
            records.forEach(function (r) {
                var exists = MOCK_COURSE_ASSIGNMENTS.some(function (a) {
                    return a.course_name === r.course_name && a.major_name === r.major_name && a.grade === r.grade && a.class_identification === r.class_identification;
                });
                if (!exists && r.course_name) {
                    MOCK_COURSE_ASSIGNMENTS.push({
                        id: Math.max.apply(null, MOCK_COURSE_ASSIGNMENTS.map(function(a){return a.id;}).concat([0])) + 1,
                        course_name: r.course_name, major_name: r.major_name || '', grade: r.grade || '', class_identification: r.class_identification || ''
                    });
                    created++;
                }
            });
            return { imported: created, total: records.length };
        });
    });

    // ---- 学生 CRUD mock ----
    registerMock('GET', '/admin/students/', function (params) {
        var results = MOCK_STUDENTS;
        if (params && params.keyword) {
            var kw = params.keyword.toLowerCase();
            results = MOCK_STUDENTS.filter(function(s) {
                return s.name.toLowerCase().indexOf(kw) !== -1 || s.student_no.indexOf(kw) !== -1;
            });
        }
        return { count: results.length, results: results };
    });

    registerMock('POST', '/admin/students/', function (body) {
        var newId = Math.max.apply(null, MOCK_STUDENTS.map(function(s){return s.id;})) + 1;
        var majorId = body.major || 1;
        var majorObj = MOCK_MAJORS.find(function(m) { return m.id === majorId; }) || MOCK_MAJORS[0];
        var cgId = body.class_group || null;
        var cgObj = cgId ? MOCK_CLASS_GROUPS.find(function(x) { return x.id === cgId; }) : null;
        var student = {
            id: newId,
            student_no: body.student_no || '',
            name: body.name || '',
            major: majorId,
            major_name: majorObj.name,
            grade: body.grade || '',
            class_identification: body.class_identification || (cgObj ? cgObj.name : ''),
            class_group: cgId,
            class_name: cgObj ? cgObj.name : ''
        };
        MOCK_STUDENTS.push(student);
        return student;
    });

    registerMockPattern('PATCH', '/admin/students/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_STUDENTS.length; i++) {
            if (MOCK_STUDENTS[i].id === id) {
                if (body.name !== undefined) MOCK_STUDENTS[i].name = body.name;
                if (body.student_no !== undefined) MOCK_STUDENTS[i].student_no = body.student_no;
                if (body.major !== undefined) {
                    MOCK_STUDENTS[i].major = body.major;
                    var m = MOCK_MAJORS.find(function(x) { return x.id === body.major; });
                    if (m) MOCK_STUDENTS[i].major_name = m.name;
                }
                if (body.grade !== undefined) MOCK_STUDENTS[i].grade = body.grade;
                if (body.class_group !== undefined) {
                    MOCK_STUDENTS[i].class_group = body.class_group;
                    var cg = body.class_group ? MOCK_CLASS_GROUPS.find(function(x) { return x.id === body.class_group; }) : null;
                    if (cg) { MOCK_STUDENTS[i].class_name = cg.name; MOCK_STUDENTS[i].class_identification = cg.name; }
                }
                if (body.class_identification !== undefined) MOCK_STUDENTS[i].class_identification = body.class_identification;
                return MOCK_STUDENTS[i];
            }
        }
        var err = new Error('Not found'); err.status = 404; throw err;
    });

    registerMockPattern('DELETE', '/admin/students/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_STUDENTS.length;
        MOCK_STUDENTS = MOCK_STUDENTS.filter(function (s) { return s.id !== id; });
        if (MOCK_STUDENTS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    // ---- 班级 mock ----
    registerMock('GET', '/admin/class-groups/', function () {
        return { count: MOCK_CLASS_GROUPS.length, results: MOCK_CLASS_GROUPS };
    });

    registerMock('POST', '/admin/class-groups/', function (body) {
        var newId = Math.max.apply(null, MOCK_CLASS_GROUPS.map(function(cg){return cg.id;})) + 1;
        var majorId = body.major || body.major_id || 1;
        var majorObj = MOCK_MAJORS.find(function(m) { return m.id === majorId; }) || MOCK_MAJORS[0];
        var cg = {
            id: newId, name: body.name || '',
            major: majorId, major_name: majorObj.name,
            grade: body.grade || ''
        };
        MOCK_CLASS_GROUPS.push(cg);
        return cg;
    });

    registerMockPattern('PATCH', '/admin/class-groups/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_CLASS_GROUPS.length; i++) {
            if (MOCK_CLASS_GROUPS[i].id === id) {
                if (body.name !== undefined) MOCK_CLASS_GROUPS[i].name = body.name;
                if (body.grade !== undefined) MOCK_CLASS_GROUPS[i].grade = body.grade;
                if (body.major !== undefined || body.major_id !== undefined) {
                    var mid = body.major || body.major_id;
                    MOCK_CLASS_GROUPS[i].major = mid;
                    var mo = MOCK_MAJORS.find(function(m) { return m.id === mid; });
                    if (mo) MOCK_CLASS_GROUPS[i].major_name = mo.name;
                }
                return MOCK_CLASS_GROUPS[i];
            }
        }
        var err = new Error('Not found'); err.status = 404; throw err;
    });

    registerMockPattern('DELETE', '/admin/class-groups/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_CLASS_GROUPS.length;
        MOCK_CLASS_GROUPS = MOCK_CLASS_GROUPS.filter(function(cg) { return cg.id !== id; });
        if (MOCK_CLASS_GROUPS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    registerMockPattern('GET', '/admin/majors/{id}/classes/', function (body, vars) {
        var majorId = parseInt(vars.id);
        return MOCK_CLASS_GROUPS.filter(function(cg) { return cg.major === majorId; });
    });

    registerMock('GET', '/admin/classrooms/', function () {
        return { count: MOCK_CLASSROOMS.length, results: MOCK_CLASSROOMS };
    });

    registerMock('POST', '/admin/classrooms/', function (body) {
        var newId = Math.max.apply(null, MOCK_CLASSROOMS.map(function(r){return r.id;})) + 1;
        var classroom = {
            id: newId,
            name: body.name || '',
            capacity: body.capacity || 60,
            building: body.building || '',
            equipment_types: body.equipment_types || [],
            is_lab: body.is_lab || false
        };
        MOCK_CLASSROOMS.push(classroom);
        return classroom;
    });

    registerMockPattern('PATCH', '/admin/classrooms/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_CLASSROOMS.length; i++) {
            if (MOCK_CLASSROOMS[i].id === id) {
                if (body.name !== undefined) MOCK_CLASSROOMS[i].name = body.name;
                if (body.capacity !== undefined) MOCK_CLASSROOMS[i].capacity = body.capacity;
                if (body.building !== undefined) MOCK_CLASSROOMS[i].building = body.building;
                if (body.equipment_types !== undefined) MOCK_CLASSROOMS[i].equipment_types = body.equipment_types;
                if (body.is_lab !== undefined) MOCK_CLASSROOMS[i].is_lab = body.is_lab;
                return MOCK_CLASSROOMS[i];
            }
        }
        var err = new Error('Not found'); err.status = 404; throw err;
    });

    registerMockPattern('DELETE', '/admin/classrooms/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_CLASSROOMS.length;
        MOCK_CLASSROOMS = MOCK_CLASSROOMS.filter(function (r) { return r.id !== id; });
        if (MOCK_CLASSROOMS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    registerMock('GET', '/admin/majors/', function () {
        return { count: MOCK_MAJORS.length, results: MOCK_MAJORS };
    });

    registerMock('POST', '/admin/majors/', function (body) {
        var newId = Math.max.apply(null, MOCK_MAJORS.map(function(m){return m.id;})) + 1;
        var major = {
            id: newId,
            name: body.name || '',
            code: body.code || '',
            student_count: body.student_count || 0
        };
        MOCK_MAJORS.push(major);
        return major;
    });

    registerMockPattern('PATCH', '/admin/majors/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_MAJORS.length; i++) {
            if (MOCK_MAJORS[i].id === id) {
                if (body.name !== undefined) MOCK_MAJORS[i].name = body.name;
                if (body.code !== undefined) MOCK_MAJORS[i].code = body.code;
                if (body.student_count !== undefined) MOCK_MAJORS[i].student_count = body.student_count;
                return MOCK_MAJORS[i];
            }
        }
        var err = new Error('Not found'); err.status = 404; throw err;
    });

    registerMockPattern('DELETE', '/admin/majors/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_MAJORS.length;
        MOCK_MAJORS = MOCK_MAJORS.filter(function (m) { return m.id !== id; });
        if (MOCK_MAJORS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    registerMockPattern('GET', '/admin/majors/{id}/students/', function (params, vars) {
        return {
            count: 120, results: [
                { id: 2024001, student_no: "2024001", name: "张三" },
                { id: 2024002, student_no: "2024002", name: "李四" },
            ]
        };
    });

    registerMock('GET', '/admin/protected-slots/', function () {
        return { count: MOCK_PROTECTED_SLOTS.length, results: MOCK_PROTECTED_SLOTS };
    });

    registerMock('POST', '/admin/protected-slots/', function (body) {
        var newSlot = { id: Date.now(), day_of_week: parseInt(body.day_of_week), start_period: parseInt(body.start_period), end_period: parseInt(body.end_period), penalty_weight: parseFloat(body.penalty_weight), description: body.description || '' };
        MOCK_PROTECTED_SLOTS.push(newSlot);
        return newSlot;
    });

    registerMockPattern('DELETE', '/admin/protected-slots/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        MOCK_PROTECTED_SLOTS = MOCK_PROTECTED_SLOTS.filter(function (s) { return s.id !== id; });
        return {};
    });

    registerMock('PUT', '/admin/protected-slots/batch-update/', function (body) {
        MOCK_PROTECTED_SLOTS = body;
        return { updated_count: body.length };
    });

    registerMock('GET', '/admin/schedule/plans/', function () {
        return { count: MOCK_SCHEDULE_PLANS.length, results: MOCK_SCHEDULE_PLANS };
    });

    registerMockPattern('DELETE', '/admin/schedule/plans/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var before = MOCK_SCHEDULE_PLANS.length;
        MOCK_SCHEDULE_PLANS = MOCK_SCHEDULE_PLANS.filter(function(p) { return p.id !== id; });
        if (MOCK_SCHEDULE_PLANS.length === before) { var err = new Error('Not found'); err.status = 404; throw err; }
        return {};
    });

    registerMockPattern('GET', '/admin/schedule/plans/{id}/', function (body, vars) {
        var id = parseInt(vars.id);
        var plan = null;
        for (var i = 0; i < MOCK_SCHEDULE_PLANS.length; i++) {
            if (MOCK_SCHEDULE_PLANS[i].id === id) { plan = MOCK_SCHEDULE_PLANS[i]; break; }
        }
        // Mock 模式下，如果方案不存在（新标签页 JS 上下文丢失），从 MOCK_COURSES 生成
        if (!plan) {
            plan = {
                id: id, plan_name: '预览方案 #' + id, semester: '2026-spring',
                status: 'DRAFT', overall_fitness: (0.8 + Math.random() * 0.15).toFixed(2),
                created_at: new Date().toISOString(), published_at: null
            };
        }
        // 如果方案已有条目就用已有的，否则从 MOCK_COURSES 生成
        if (!plan.entries || plan.entries.length === 0) {
            var classrooms = ['A101', 'A102', 'B201', 'B203', 'C301', 'D101', 'D202', 'E401'];
            var entries = MOCK_COURSES.map(function(c, idx) {
                var slots = (c.time_slots && c.time_slots.length > 0) ? c.time_slots : [
                    { day_of_week: (idx % 5) + 1, period: ((idx * 2) % 11) + 1 }
                ];
                return slots.map(function(s) {
                    var roomName = classrooms[(idx + s.day_of_week + s.period) % classrooms.length];
                    return {
                        id: idx * 100 + s.day_of_week * 11 + s.period,
                        course: { id: c.course_id, name: c.name, code: c.code || '', credit: c.credit },
                        teacher: { id: (idx % 8) + 1, name: c.teacher || '未知教师' },
                        classroom: { id: (idx % 8) + 1, name: roomName },
                        day_of_week: s.day_of_week,
                        period: s.period,
                        week: 1,
                        student_group_ids: []
                    };
                });
            }).flat();
            plan.entries = entries;
        }
        return plan;
    });

    registerMockPattern('GET', '/admin/schedule/plans/{id}/evaluation/', function (body, vars) {
        return {
            overall_fitness: 0.91, daily_hour_variance: 1.2,
            daily_distribution: [4, 6, 4, 6, 4],
            protected_slot_occupied: 1, hard_constraint_violations: []
        };
    });

    registerMock('GET', '/teacher/schedule/', function (params) {
        // Mock 模式：按 teacher_id 或 teacher name 筛选课程
        var tid = params ? parseInt(params.teacher_id) : 0;
        var MOCK_TEACHER_NAMES = {1:'张教授',2:'李老师',3:'王教授',4:'赵教授',5:'陈老师'};
        var tname = MOCK_TEACHER_NAMES[tid] || '';
        var teacher = MOCK_TEACHERS.find(function(t){return t.id === tid;});
        var classrooms = ['A101', 'A102', 'B201', 'C301', 'D101'];

        var courses = MOCK_COURSES.filter(function(c) {
            return tname && c.teacher === tname;
        }).map(function(c, idx) {
            // 给每个课程的 time_slots 添加 week 和 classroom 信息
            var room = classrooms[idx % classrooms.length];
            return {
                course_id: c.course_id,
                name: c.name,
                code: c.code || '',
                credit: c.credit,
                hours: c.hours || 48,
                is_professional_course: c.is_professional,
                expected_student_count: c.capacity,
                time_slots: (c.time_slots || []).map(function(s, si) {
                    // 模拟不同周段：前9周和后9周可能有不同教室
                    return {
                        day_of_week: s.day_of_week,
                        period: s.period,
                        week_start: 1,
                        week_end: 18,
                        classroom: room
                    };
                })
            };
        });

        return {
            teacher: teacher ? {id:teacher.id, name:teacher.name, employee_no:teacher.employee_no, department:teacher.department} : null,
            courses: courses,
            total_courses: courses.length
        };
    });

    registerMockPattern('POST', '/admin/schedule/plans/{id}/publish/', function (body, vars) {
        var id = parseInt(vars.id);
        for (var i = 0; i < MOCK_SCHEDULE_PLANS.length; i++) {
            if (MOCK_SCHEDULE_PLANS[i].id === id) {
                MOCK_SCHEDULE_PLANS[i].status = 'PUBLISHED';
                MOCK_SCHEDULE_PLANS[i].published_at = new Date().toISOString();
                var planEntries = MOCK_SCHEDULE_PLANS[i].entries || [];
                var courseIds = {};
                planEntries.forEach(function(e) { if (e.course) courseIds[e.course.id] = true; });
                return { plan_id: id, status: 'PUBLISHED', published_at: MOCK_SCHEDULE_PLANS[i].published_at, synced_courses: Object.keys(courseIds).length, synced_items: planEntries.length };
            }
        }
        return {};
    });

    var _mockPlanEntryId = 1;
    var _mockTaskStore = {};

    registerMock('POST', '/admin/schedule/generate/', function (body) {
        var classrooms = ['A101', 'A102', 'B201', 'B203', 'C301', 'D101', 'D202', 'E401'];
        var planId = Date.now();
        var entries = [];
        MOCK_COURSES.forEach(function (c, idx) {
            var slots = (c.time_slots && c.time_slots.length > 0) ? c.time_slots : [
                { day_of_week: (idx % 5) + 1, period: ((idx * 2) % 11) + 1 },
                { day_of_week: (idx % 5) + 1, period: ((idx * 2 + 1) % 11) + 1 }
            ];
            slots.forEach(function (s) {
                var roomName = classrooms[(idx + s.day_of_week + s.period) % classrooms.length];
                entries.push({
                    id: _mockPlanEntryId++,
                    course: { id: c.course_id, name: c.name, code: c.code || '', credit: c.credit },
                    teacher: { id: (idx % 8) + 1, name: c.teacher || '未知教师' },
                    classroom: { id: (idx % 8) + 1, name: roomName },
                    day_of_week: s.day_of_week,
                    period: s.period,
                    week: 1,
                    student_group_ids: []
                });
            });
        });
        var newPlan = {
            id: planId, plan_name: body.plan_name || '新方案',
            semester: body.semester || '2026-spring', status: 'DRAFT',
            overall_fitness: (0.8 + Math.random() * 0.15).toFixed(2),
            created_at: new Date().toISOString(), published_at: null,
            entries: entries
        };
        MOCK_SCHEDULE_PLANS.unshift(newPlan);
        var taskId = 'mock_task_' + planId;
        // 记录任务开始时间，模拟 3-5 秒的渐进式生成
        _mockTaskStore[taskId] = { startTime: Date.now(), planId: planId, totalEntries: entries.length };
        return { task_id: taskId, status: 'PENDING' };
    });

    registerMockPattern('GET', '/admin/schedule/tasks/{id}/', function (body, vars) {
        var taskId = vars.id;
        var stored = _mockTaskStore[taskId];
        if (!stored) {
            // 新标签页：直接返回完成
            return { task_id: taskId, status: 'SUCCESS', progress: 1.0, current_generation: 200 + Math.floor(Math.random() * 300), best_fitness: (0.85 + Math.random() * 0.12).toFixed(2), total_entries: 156 };
        }
        var elapsed = (Date.now() - stored.startTime) / 1000;
        var duration = 3 + Math.random() * 2; // 3-5 秒完成
        var progress = Math.min(1.0, elapsed / duration);
        var gen = Math.floor(progress * (200 + Math.floor(Math.random() * 300)));
        var fitness = (0.5 + progress * 0.4 + Math.random() * 0.05).toFixed(2);
        if (progress >= 1.0) {
            return { task_id: taskId, status: 'SUCCESS', progress: 1.0, current_generation: gen, best_fitness: parseFloat(fitness), total_entries: stored.totalEntries };
        }
        return { task_id: taskId, status: 'RUNNING', progress: progress, current_generation: gen, best_fitness: parseFloat(fitness), total_entries: 0 };
    });

    registerMock('POST', '/admin/conflict-analysis/run/', function () {
        return { task_id: 'conflict_task_' + Date.now(), status: 'PENDING' };
    });

    registerMockPattern('GET', '/admin/conflict-analysis/tasks/{id}/', function (body, vars) {
        return { task_id: vars.id, status: 'SUCCESS', progress: 1.0, analyzed_pairs: 1225, total_pairs: 1225, conflict_pairs_found: 8 };
    });

    registerMock('GET', '/admin/conflict-analysis/results/', function () {
        return { count: MOCK_CONFLICT_RESULTS.length, results: MOCK_CONFLICT_RESULTS };
    });

    registerMockPattern('GET', '/admin/conflict-analysis/results/{id}/pairs/', function (body, vars) {
        return {
            count: 8, results: [
                { id: 1, course_a: { id: 101, name: "数据结构", code: "CS201", hours: 64 }, course_b: { id: 207, name: "经济学原理", code: "ECON101", hours: 48 }, conflicting_student_count: 56, conflict_rate: 0.47, overlapping_slots: [{day:1,day_name:"周一",period:3},{day:1,day_name:"周一",period:4},{day:3,day_name:"周三",period:3}] },
                { id: 2, course_a: { id: 102, name: "操作系统", code: "CS301", hours: 64 }, course_b: { id: 305, name: "人工智能导论", code: "CS305", hours: 48 }, conflicting_student_count: 42, conflict_rate: 0.35, overlapping_slots: [{day:2,day_name:"周二",period:1},{day:2,day_name:"周二",period:2},{day:4,day_name:"周四",period:1}] },
                { id: 3, course_a: { id: 103, name: "计算机组成原理", code: "CS202", hours: 64 }, course_b: { id: 401, name: "离散数学", code: "MATH201", hours: 48 }, conflicting_student_count: 38, conflict_rate: 0.31, overlapping_slots: [{day:3,day_name:"周三",period:5},{day:3,day_name:"周三",period:6}] },
                { id: 4, course_a: { id: 104, name: "计算机网络", code: "CS302", hours: 48 }, course_b: { id: 306, name: "软件工程", code: "CS303", hours: 48 }, conflicting_student_count: 35, conflict_rate: 0.29, overlapping_slots: [{day:5,day_name:"周五",period:3},{day:5,day_name:"周五",period:4}] },
                { id: 5, course_a: { id: 105, name: "数据库原理", code: "CS203", hours: 64 }, course_b: { id: 208, name: "管理学", code: "MGMT101", hours: 32 }, conflicting_student_count: 28, conflict_rate: 0.23, overlapping_slots: [{day:1,day_name:"周一",period:7}] },
                { id: 6, course_a: { id: 106, name: "编译原理", code: "CS401", hours: 48 }, course_b: { id: 307, name: "计算机图形学", code: "CS402", hours: 48 }, conflicting_student_count: 22, conflict_rate: 0.18, overlapping_slots: [{day:4,day_name:"周四",period:3},{day:4,day_name:"周四",period:4}] },
                { id: 7, course_a: { id: 107, name: "线性代数", code: "MATH102", hours: 48 }, course_b: { id: 209, name: "概率论", code: "MATH202", hours: 48 }, conflicting_student_count: 19, conflict_rate: 0.16, overlapping_slots: [{day:2,day_name:"周二",period:5}] },
                { id: 8, course_a: { id: 108, name: "大学英语", code: "ENG101", hours: 64 }, course_b: { id: 210, name: "大学体育", code: "PE101", hours: 32 }, conflicting_student_count: 12, conflict_rate: 0.10, overlapping_slots: [{day:5,day_name:"周五",period:9}] },
            ]
        };
    });

    registerMock('GET', '/admin/algorithm-config/', function () {
        return MOCK_ALGORITHM_CONFIG;
    });

    registerMock('PUT', '/admin/algorithm-config/', function (body) {
        for (var key in body) {
            if (body.hasOwnProperty(key)) MOCK_ALGORITHM_CONFIG[key] = body[key];
        }
        MOCK_ALGORITHM_CONFIG.updated_at = new Date().toISOString();
        MOCK_ALGORITHM_CONFIG.updated_by = '张教务';
        return MOCK_ALGORITHM_CONFIG;
    });

    // ======================== 公开 API ========================

    return {
        config: CONFIG,
        setMockMode: setMockMode,
        setBaseUrl: setBaseUrl,
        isMockMode: isMockMode,
        getBaseUrl: getBaseUrl,

        token: {
            getAccess: getAccessToken,
            getRefresh: getRefreshToken,
            set: setTokens,
            clear: clearTokens,
            isAuthenticated: isAuthenticated,
        },
        setLoginMode: setLoginMode,
        getLoginMode: getLoginMode,
        isAuthenticated: isAuthenticated,
        getUserRole: function () { return sessionStorage.getItem('userRole') || ''; },

        _mockSelected: mockSelected,
        _buildBitmap: buildBitmap,
        _getCourseById: getCourseById,
        _hasBitmapConflict: hasBitmapConflict,
        _getMockCourseList: getMockCourseList,

        auth: {
            login: function (username, password, role) {
                return apiCall('POST', '/auth/login/', { username: username, password: password, role: role || '' });
            },
            register: function (payload) {
                return apiCall('POST', '/auth/register/', payload);
            },
            logout: function () {
                var refresh = getRefreshToken();
                clearTokens();
                if (refresh) return apiCall('POST', '/auth/logout/', { refresh: refresh });
                return Promise.resolve({ detail: 'Logged out' });
            },
            me: function () { return apiCall('GET', '/auth/me/'); }
        },

        teacher: {
            getSchedule: function (teacherId) {
                var path = '/teacher/schedule/';
                if (teacherId) path += '?teacher_id=' + teacherId;
                return apiCall('GET', path);
            }
        },

        student: {
            getSchedule: function () { return apiCall('GET', '/student/schedule/'); },
            getCourses: function (params) {
                params = params || {};
                var query = [];
                if (params.page) query.push('page=' + params.page);
                if (params.page_size) query.push('page_size=' + params.page_size);
                if (params.keyword) query.push('keyword=' + encodeURIComponent(params.keyword));
                if (params.major) query.push('major=' + params.major);
                return apiCall('GET', '/student/courses/?' + query.join('&'));
            },
            getConflictDetail: function (courseId) {
                return apiCall('GET', '/student/courses/' + courseId + '/conflict-detail/');
            },
            selectCourse: function (courseId) {
                return apiCall('POST', '/student/courses/' + courseId + '/select/');
            },
            dropCourse: function (courseId) {
                return apiCall('DELETE', '/student/courses/' + courseId + '/drop/');
            },
            getFreeSlots: function () { return apiCall('GET', '/student/free-slots/'); },
            getFreeSlotRecommendations: function (day, period, params) {
                var query = [];
                if (params && params.major) query.push('major=' + params.major);
                if (params && params.category) query.push('category=' + encodeURIComponent(params.category));
                return apiCall('GET', '/student/free-slots/' + day + '/' + period + '/recommend/?' + query.join('&'));
            }
        },

        admin: {
            getCourses: function (params) { return apiCall('GET', '/admin/courses/?page_size=10000'); },
            createCourse: function (data) { return apiCall('POST', '/admin/courses/', data); },
            updateCourse: function (id, data) { return apiCall('PATCH', '/admin/courses/' + id + '/', data); },
            deleteCourse: function (id) { return apiCall('DELETE', '/admin/courses/' + id + '/'); },
            assignCourse: function (courseId, data) { return apiCall('POST', '/admin/courses/' + courseId + '/assign/', data); },
            getCourseAssignments: function (courseId) { return apiCall('GET', '/admin/courses/' + courseId + '/assignments/'); },
            deleteCourseAssignment: function (id) { return apiCall('DELETE', '/admin/course-assignments/' + id + '/'); },
            importCoursesJSON: function (file, sessionLength) {
                var formData = new FormData();
                formData.append('file', file);
                if (sessionLength != null) formData.append('session_length', String(sessionLength));
                return apiCall('POST', '/admin/courses/import/', formData, { isFormData: true });
            },
            exportCoursesJSON: function () { return apiCall('GET', '/admin/courses/export/'); },
            batchDeleteCourses: function (ids) { return apiCall('POST', '/admin/courses/batch_delete/', { ids: ids }); },
            deleteAllCourses: function (password) { return apiCall('POST', '/admin/courses/delete_all/', { password: password }); },
            getTeachers: function (params) { return apiCall('GET', '/admin/teachers/?page_size=10000'); },
            createTeacher: function (data) { return apiCall('POST', '/admin/teachers/', data); },
            updateTeacher: function (id, data) { return apiCall('PATCH', '/admin/teachers/' + id + '/', data); },
            deleteTeacher: function (id) { return apiCall('DELETE', '/admin/teachers/' + id + '/'); },
            exportTeachersJSON: function () { return apiCall('GET', '/admin/teachers/export/'); },
            importTeachersJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/teachers/import_json/', fd, { isFormData: true }); },
            getClassrooms: function () { return apiCall('GET', '/admin/classrooms/?page_size=10000'); },
            createClassroom: function (data) { return apiCall('POST', '/admin/classrooms/', data); },
            updateClassroom: function (id, data) { return apiCall('PATCH', '/admin/classrooms/' + id + '/', data); },
            deleteClassroom: function (id) { return apiCall('DELETE', '/admin/classrooms/' + id + '/'); },
            exportClassroomsJSON: function () { return apiCall('GET', '/admin/classrooms/export/'); },
            importClassroomsJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/classrooms/import_json/', fd, { isFormData: true }); },
            getStudents: function (params) { return apiCall('GET', '/admin/students/?page_size=10000'); },
            createStudent: function (data) { return apiCall('POST', '/admin/students/', data); },
            updateStudent: function (id, data) { return apiCall('PATCH', '/admin/students/' + id + '/', data); },
            deleteStudent: function (id) { return apiCall('DELETE', '/admin/students/' + id + '/'); },
            exportStudentsJSON: function () { return apiCall('GET', '/admin/students/export/'); },
            importStudentsJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/students/import_json/', fd, { isFormData: true }); },
            getMajors: function () { return apiCall('GET', '/admin/majors/?page_size=10000'); },
            createMajor: function (data) { return apiCall('POST', '/admin/majors/', data); },
            updateMajor: function (id, data) { return apiCall('PATCH', '/admin/majors/' + id + '/', data); },
            deleteMajor: function (id) { return apiCall('DELETE', '/admin/majors/' + id + '/'); },
            exportMajorsJSON: function () { return apiCall('GET', '/admin/majors/export/'); },
            importMajorsJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/majors/import_json/', fd, { isFormData: true }); },
            getMajorStudents: function (majorId) { return apiCall('GET', '/admin/majors/' + majorId + '/students/'); },
            getMajorClasses: function (majorId) { return apiCall('GET', '/admin/majors/' + majorId + '/classes/'); },
            getClassGroups: function () { return apiCall('GET', '/admin/class-groups/?page_size=10000'); },
            createClassGroup: function (data) { return apiCall('POST', '/admin/class-groups/', data); },
            updateClassGroup: function (id, data) { return apiCall('PATCH', '/admin/class-groups/' + id + '/', data); },
            deleteClassGroup: function (id) { return apiCall('DELETE', '/admin/class-groups/' + id + '/'); },
            exportClassGroupsJSON: function () { return apiCall('GET', '/admin/class-groups/export/'); },
            importClassGroupsJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/class-groups/import_json/', fd, { isFormData: true }); },
            getCourseAssignmentsList: function () { return apiCall('GET', '/admin/course-assignments/?page_size=10000'); },
            exportCourseAssignmentsJSON: function () { return apiCall('GET', '/admin/course-assignments/export/'); },
            importCourseAssignmentsJSON: function (file) { var fd = new FormData(); fd.append('file', file); return apiCall('POST', '/admin/course-assignments/import_json/', fd, { isFormData: true }); },

            getProtectedSlots: function () { return apiCall('GET', '/admin/protected-slots/'); },
            addProtectedSlot: function (data) { return apiCall('POST', '/admin/protected-slots/', data); },
            deleteProtectedSlot: function (id) { return apiCall('DELETE', '/admin/protected-slots/' + id + '/'); },
            batchUpdateProtectedSlots: function (data) { return apiCall('PUT', '/admin/protected-slots/batch-update/', data); },

            getSchedulePlans: function () { return apiCall('GET', '/admin/schedule/plans/'); },
            deleteSchedulePlan: function (id) { return apiCall('DELETE', '/admin/schedule/plans/' + id + '/'); },
            getSchedulePlan: function (id) { return apiCall('GET', '/admin/schedule/plans/' + id + '/'); },
            getSchedulePlanEvaluation: function (id) { return apiCall('GET', '/admin/schedule/plans/' + id + '/evaluation/'); },
            generateSchedule: function (data) { return apiCall('POST', '/admin/schedule/generate/', data); },
            publishPlan: function (id) { return apiCall('POST', '/admin/schedule/plans/' + id + '/publish/'); },
            getScheduleTask: function (taskId) { return apiCall('GET', '/admin/schedule/tasks/' + taskId + '/'); },

            runConflictAnalysis: function (data) { return apiCall('POST', '/admin/conflict-analysis/run/', data); },
            getConflictTask: function (taskId) { return apiCall('GET', '/admin/conflict-analysis/tasks/' + taskId + '/'); },
            getConflictResults: function () { return apiCall('GET', '/admin/conflict-analysis/results/'); },
            getConflictPairs: function (resultId) { return apiCall('GET', '/admin/conflict-analysis/results/' + resultId + '/pairs/'); },

            getAlgorithmConfig: function () { return apiCall('GET', '/admin/algorithm-config/'); },
            updateAlgorithmConfig: function (data) { return apiCall('PUT', '/admin/algorithm-config/', data); },
        }
    };
})();
/** End of CourseQSortAPI */
