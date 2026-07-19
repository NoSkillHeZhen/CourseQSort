(function checkLogin() {
    if (!CourseQSortAPI.isMockMode() && !CourseQSortAPI.isAuthenticated()) {
        window.location.replace('index.html');
        return;
    }
    var name = sessionStorage.getItem('studentName') || '同学';
    document.getElementById('student-name-display').textContent = name + '，你好';

    // 数据来源标识
    var badge = document.getElementById('data-source-badge');
    if (CourseQSortAPI.getLoginMode() === 'jwt' && !CourseQSortAPI.isMockMode()) {
        badge.textContent = '后端模式';
        badge.className = 'badge bg-warning text-dark me-2';
    } else {
        badge.textContent = '预览模式';
        badge.className = 'badge bg-light text-dark me-2';
    }
})();

// ======================== DOM 引用 ========================

var courseListTbody = document.getElementById('course-list');
var selectedContainer = document.getElementById('selected-list');
var freeSlotsContainer = document.getElementById('free-slots-list');
var totalCreditsSpan = document.getElementById('total-credits');
var courseCountBadge = document.getElementById('course-count-badge');
var paginationInfo = document.getElementById('pagination-info');
var prevPageBtn = document.getElementById('prev-page-btn');
var nextPageBtn = document.getElementById('next-page-btn');
var loadingOverlay = document.getElementById('loading-overlay');

// ======================== 全局状态 ========================

var selectedCourses = [];     // 已选课程列表
var currentCourses = [];      // 当前页显示的课程
var currentPage = 1;
var pageSize = 20;
var totalCourseCount = 0;
var maxCredits = 25;
var isDataLoading = false;
var selectedFreeSlot = null;  // {day_of_week, period} 当前高亮的空闲时段

// ======================== 加载控制 ========================

function showLoading(msg) {
    isDataLoading = true;
    var overlay = loadingOverlay;
    overlay.style.display = 'flex';
    var p = overlay.querySelector('p');
    if (msg) p.textContent = msg;
}

function hideLoading() {
    isDataLoading = false;
    loadingOverlay.style.display = 'none';
}

// ======================== 工具函数 ========================

function buildBitmap(slotsArray) {
    return CourseQSortAPI._buildBitmap(slotsArray);
}

function hasBitmapConflict(bm1, bm2) {
    return CourseQSortAPI._hasBitmapConflict(bm1, bm2);
}

// 合并连续节次显示 (如节次 1,2,3 显示为"1-3节")
function formatTimeSlots(slots) {
    var dayMap = {};
    slots.forEach(function (s) {
        var d = s.day_of_week || s.day;
        if (!dayMap[d]) dayMap[d] = [];
        dayMap[d].push(s.period);
    });
    var parts = [];
    var weekNames = ['一', '二', '三', '四', '五'];
    for (var day = 1; day <= 5; day++) {
        if (dayMap[day]) {
            var periods = dayMap[day].sort(function (a, b) { return a - b; });
            var merged = [];
            var start = periods[0], end = periods[0];
            for (var i = 1; i < periods.length; i++) {
                if (periods[i] === end + 1) { end = periods[i]; }
                else {
                    merged.push(start === end ? start + '节' : start + '-' + end + '节');
                    start = periods[i]; end = periods[i];
                }
            }
            merged.push(start === end ? start + '节' : start + '-' + end + '节');
            parts.push('周' + weekNames[day - 1] + ' ' + merged.join(','));
        }
    }
    return parts.join('<br>') || '未知';
}

// 格式化分时段信息（显示周次范围 + 时间 + 教室）
function formatSegments(segments) {
    if (!segments || segments.length === 0) return '';
    var weekNames = ['一', '二', '三', '四', '五'];
    var html = '';
    segments.forEach(function (seg) {
        var weekStr = seg.week_start === seg.week_end ? '第' + seg.week_start + '周' : '第' + seg.week_start + '-' + seg.week_end + '周';
        var dayMap = {};
        (seg.time_slots || []).forEach(function (s) {
            var d = s.day_of_week || s.day;
            if (!dayMap[d]) dayMap[d] = [];
            dayMap[d].push(s.period);
        });
        var parts = [];
        for (var day = 1; day <= 5; day++) {
            if (dayMap[day]) {
                var periods = dayMap[day].sort(function (a, b) { return a - b; });
                var start = periods[0], end = periods[periods.length - 1];
                parts.push('周' + weekNames[day - 1] + ' ' + (start === end ? start + '节' : start + '-' + end + '节'));
            }
        }
        var loc = seg.classroom ? ' <span class="text-muted">' + seg.classroom + '</span>' : '';
        html += '<div class="segment-line small">' + weekStr + ' ' + parts.join(', ') + loc + '</div>';
    });
    return html;
}

// 计算某课程与已选课程的冲突详情
function getConflictDetails(courseTimeSlots) {
    var conflicts = [];
    var courseBm = buildBitmap(courseTimeSlots);
    selectedCourses.forEach(function (sc) {
        var scBm = buildBitmap(sc.time_slots);
        if (hasBitmapConflict(courseBm, scBm)) {
            var conflictSlots = [];
            for (var i = 0; i < 55; i++) {
                if (courseBm[i] === '1' && scBm[i] === '1') {
                    conflictSlots.push({ day_of_week: Math.floor(i / 11) + 1, period: (i % 11) + 1 });
                }
            }
            conflicts.push({
                course_name: sc.name,
                teacher: sc.teacher || '',
                conflict_slots: conflictSlots
            });
        }
    });
    return conflicts;
}

// ======================== 数据加载 ========================

async function initApp() {
    showLoading('正在加载课程数据...');
    try {
        var scheduleData = await CourseQSortAPI.student.getSchedule();
        selectedCourses = scheduleData.courses || [];
        console.log('[DEBUG] Schedule API 返回的课程数:', selectedCourses.length);
        selectedCourses.forEach(function(c) {
            if (c.segments && c.segments.length > 1) {
                console.log('[DEBUG] 已选课程#' + c.course_id + ' "' + c.name + '" segments(' + c.segments.length + '个):', JSON.parse(JSON.stringify(c.segments)));
            }
        });
        sessionStorage.setItem('selectedCoursesData', JSON.stringify(selectedCourses));

        // 加载课程列表，如果失败则在内部处理
        await loadCoursePage(1);
        renderAll();
        hideLoading();
    } catch (err) {
        console.error('[App] Init error:', err);
        // 如果整个初始化失败（如 schedule 加载失败），显示全局错误
        courseListTbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">初始化失败，请检查后端服务或刷新页面</td></tr>';
        // 确保按钮禁用
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        paginationInfo.textContent = '初始化失败';
        hideLoading();
    }
}

async function loadCoursePage(page) {
    try {
        var data = await CourseQSortAPI.student.getCourses({
            page: page,
            page_size: pageSize   // 此时 pageSize = 15
        });
        totalCourseCount = data.count;
        currentPage = page;
        currentCourses = data.results || [];

        // DEBUG: 检查后端返回的课程数及 segments
        console.log('[DEBUG] CourseList API: count=' + data.count + ' results=' + currentCourses.length);

        var totalPages = Math.ceil(totalCourseCount / pageSize) || 1;
        paginationInfo.textContent = '第 ' + page + ' / ' + totalPages + ' 页 (共 ' + totalCourseCount + ' 门)';
        prevPageBtn.disabled = (page <= 1);
        nextPageBtn.disabled = (page >= totalPages);

        return data;
    } catch (err) {
        console.error('[App] Load courses error:', err);
        currentCourses = [];
        totalCourseCount = 0;
        paginationInfo.textContent = '加载失败，请重试';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        courseListTbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">课程数据加载失败</td></tr>';
        return null;
    }
}
async function refreshAll() {
    showLoading('正在刷新数据...');
    try {
        var scheduleData = await CourseQSortAPI.student.getSchedule();
        selectedCourses = scheduleData.courses || [];
        sessionStorage.setItem('selectedCoursesData', JSON.stringify(selectedCourses));
        await loadCoursePage(currentPage);
        renderAll();
    } catch (err) {
        console.error('[App] Refresh error:', err);
    }
    hideLoading();
}

// ======================== 渲染函数 ========================

function renderAll() {
    renderCourseList(currentCourses);
    renderSelectedCourses();
    renderFreeSlots();
    updateTotalCredits();
}

function renderCourseList(courses) {
    courseListTbody.innerHTML = '';
    courseCountBadge.textContent = '共 ' + totalCourseCount + ' 门';
    courseCountBadge.className = 'badge me-2 ' + (totalCourseCount > 0 ? 'bg-light text-dark' : 'bg-secondary');

    if (!courses || courses.length === 0) {
        courseListTbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">暂无课程数据</td></tr>';
        return;
    }

    // DEBUG: 打印每门课返回的 segments 数据
    courses.forEach(function (course) {
        if (course.segments && course.segments.length > 1) {
            console.log('[DEBUG] 课程#' + course.course_id + ' "' + course.name + '" segments(' + course.segments.length + '个):', JSON.parse(JSON.stringify(course.segments)));
        }
    });
    courses.forEach(function (course) {
        var alreadySelected = selectedCourses.some(function (sc) {
            return sc.course_id === course.course_id;
        });

        var tr = document.createElement('tr');
        if (alreadySelected) {
            tr.className = 'table-success';
        } else if (course.conflict) {
            tr.className = 'conflict-row';
        }

        var timeStr = formatTimeSlots(course.time_slots);
        var remaining = course.remaining_capacity !== undefined ? course.remaining_capacity :
            (course.capacity - course.enrolled_count);

        var actionHtml = '';
        if (alreadySelected) {
            var isMandatory = selectedCourses.find(function (sc) { return sc.course_id === course.course_id; });
            if (isMandatory && isMandatory.mandatory) {
                actionHtml = '<span class="badge badge-mandatory bg-warning text-dark"><i class="bi bi-lock-fill"></i> 必修</span>';
            } else {
                actionHtml = '<span class="badge bg-success"><i class="bi bi-check-lg"></i> 已选</span>';
            }
        } else if (course.conflict) {
            var conflictInfo = getConflictDetails(course.time_slots);
            actionHtml = '<span class="badge bg-danger conflict-badge" data-course-id="' + course.course_id +
                '" data-conflict-info=\'' + JSON.stringify(conflictInfo).replace(/'/g, "&#39;") + '\' style="cursor:pointer;">' +
                '<i class="bi bi-exclamation-triangle-fill"></i> 冲突</span>';
        } else if (remaining <= 0) {
            actionHtml = '<span class="badge bg-secondary"><i class="bi bi-x-circle"></i> 已满</span>';
        } else {
            actionHtml = '<button class="btn btn-sm btn-primary select-btn" data-id="' + course.course_id + '">' +
                '<i class="bi bi-plus-circle"></i> 选课</button>';
        }

        // 分类标签
        var catTag = '';
        var catClass = '';
        if (course.category) {
            switch (course.category) {
                case '专必': catClass = 'cat-required'; break;
                case '专选': catClass = 'cat-elective'; break;
                case '通识': catClass = 'cat-general'; break;
                case '体育': catClass = 'cat-pe'; break;
                default: catClass = 'cat-professional';
            }
            catTag = '<span class="course-category-tag ' + catClass + '">' + course.category + '</span>';
        }
        // 学分样式
        var creditClass = (course.credit || 0) >= 3 ? 'fw-bold text-primary' : '';
        // 余量样式
        var remaining = course.remaining_capacity !== undefined ? course.remaining_capacity :
            (course.capacity - course.enrolled_count);
        var capClass = remaining <= 0 ? 'text-danger fw-bold' :
                       remaining <= 5 ? 'text-warning fw-bold' : 'text-success';
        var capText = remaining <= 0 ? '已满' : (course.enrolled_count || 0) + '/' + (course.capacity || 0);

        tr.innerHTML =
            '<td>' + (course.name || '') + catTag +
                (course.mandatory ? '<span class="badge bg-warning text-dark ms-1" style="font-size:10px;"><i class="bi bi-lock-fill"></i></span>' : '') +
            '</td>' +
            '<td class="' + creditClass + '">' + (course.credit || 0) + '</td>' +
            '<td>' + (course.teacher || '') + '</td>' +
            '<td class="small">' +
                (function() {
                    // 如果有 segments 就用，否则从 time_slots 构造默认段（第1-18周）
                    var segs = (course.segments && course.segments.length > 0) ? course.segments :
                        [{ week_start: 1, week_end: 18, time_slots: course.time_slots || [], classroom: course.classroom || '' }];
                    return formatSegments(segs);
                })() +
            '</td>' +
            '<td class="' + capClass + '">' + capText + '</td>' +
            '<td>' + actionHtml + '</td>';
        courseListTbody.appendChild(tr);

        // 绑定冲突浮窗
        var badge = tr.querySelector('.conflict-badge');
        if (badge) {
            badge.addEventListener('mouseenter', function (e) {
                var info = JSON.parse(this.getAttribute('data-conflict-info'));
                showConflictPopover(e, info);
            });
            badge.addEventListener('mouseleave', hideConflictPopover);
        }

        // 绑定选课按钮
        var selectBtn = tr.querySelector('.select-btn');
        if (selectBtn) {
            selectBtn.addEventListener('click', function () {
                var cid = parseInt(this.getAttribute('data-id'));
                handleSelectCourse(cid);
            });
        }
    });
}

function renderSelectedCourses() {
    selectedContainer.innerHTML = '';
    if (!selectedCourses || selectedCourses.length === 0) {
        selectedContainer.innerHTML = '<p class="text-muted small mb-0">尚未选择任何课程</p>';
        return;
    }

    var ul = document.createElement('ul');
    ul.className = 'list-group list-group-flush';
    selectedCourses.forEach(function (c) {
        var li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center p-2 small' +
            (c.mandatory ? ' mandatory-item' : '');
        var rightPart = '';
        if (c.mandatory) {
            rightPart = '<span class="badge badge-mandatory bg-warning text-dark"><i class="bi bi-lock-fill"></i> 必修</span>';
        } else {
            rightPart = '<button class="btn btn-outline-danger btn-sm py-0 px-1 drop-btn" data-id="' + c.course_id + '" title="退课"><i class="bi bi-x-lg"></i></button>';
        }
        li.innerHTML = '<div><span>' + (c.name || '') + '</span>' +
            '<span class="badge credit-badge ms-1 ' + ((c.credit || 0) >= 3 ? 'bg-primary' : 'bg-secondary') + '">' + (c.credit || 0) + '学分</span></div>' +
            rightPart;
        ul.appendChild(li);
    });
    selectedContainer.appendChild(ul);

    // 绑定退课事件
    ul.querySelectorAll('.drop-btn').forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var cid = parseInt(this.getAttribute('data-id'));
            handleDropCourse(cid);
        });
    });
}

function renderFreeSlots() {
    freeSlotsContainer.innerHTML = '';
    // 计算空闲位图
    var totalBitmap = new Array(55).fill('0');
    selectedCourses.forEach(function (sc) {
        var bm = buildBitmap(sc.time_slots).split('');
        for (var i = 0; i < 55; i++) {
            if (bm[i] === '1') totalBitmap[i] = '1';
        }
    });

    var freeSlots = [];
    for (var i = 0; i < 55; i++) {
        if (totalBitmap[i] === '0') {
            freeSlots.push({ day_of_week: Math.floor(i / 11) + 1, period: (i % 11) + 1 });
        }
    }

    if (freeSlots.length === 0) {
        freeSlotsContainer.innerHTML = '<p class="text-muted small mb-0">暂无私立时段</p>';
        return;
    }

    freeSlots.forEach(function (slot) {
        var btn = document.createElement('button');
        btn.className = 'btn btn-outline-info btn-sm free-slot-btn';
        // 高亮当前选中的时段
        if (selectedFreeSlot && selectedFreeSlot.day_of_week === slot.day_of_week && selectedFreeSlot.period === slot.period) {
            btn.classList.add('active-slot');
        }
        btn.textContent = '周' + ['一', '二', '三', '四', '五'][slot.day_of_week - 1] + ' 第' + slot.period + '节';
        btn.addEventListener('click', function () {
            filterByFreeSlot(slot.day_of_week, slot.period);
        });
        freeSlotsContainer.appendChild(btn);
    });

    var showAllBtn = document.createElement('button');
    showAllBtn.className = 'btn btn-outline-secondary btn-sm w-100 mt-2';
    showAllBtn.textContent = '显示全部课程';
    showAllBtn.addEventListener('click', function () {
        selectedFreeSlot = null;
        loadCoursePage(1).then(function () { renderCourseList(currentCourses); renderFreeSlots(); });
    });
    freeSlotsContainer.appendChild(showAllBtn);
}

function updateTotalCredits() {
    var total = selectedCourses.reduce(function (sum, sc) { return sum + (sc.credit || 0); }, 0);
    var ratio = total / maxCredits;
    totalCreditsSpan.textContent = total + ' / ' + maxCredits + ' 学分';
    totalCreditsSpan.className = 'badge me-2 ' +
        (ratio >= 1 ? 'bg-danger' : ratio >= 0.85 ? 'bg-warning text-dark' : 'bg-light text-dark');
}

// ======================== 交互操作 ========================

async function handleSelectCourse(courseId) {
    if (isDataLoading) return;

    // 学分检查
    var currentCredits = selectedCourses.reduce(function (sum, sc) { return sum + (sc.credit || 0); }, 0);
    var course = null;
    for (var i = 0; i < currentCourses.length; i++) {
        if (currentCourses[i].course_id === courseId) {
            course = currentCourses[i];
            break;
        }
    }
    if (!course) return;
    if (currentCredits + course.credit > maxCredits) {
        alert('选课后总学分将超过上限 ' + maxCredits + ' 学分');
        return;
    }

    showLoading('正在选课...');
    try {
        var result = await CourseQSortAPI.student.selectCourse(courseId);
        alert(result.message || '选课成功');
        await refreshAll();
    } catch (err) {
        if (err.data && err.data.message) {
            alert(err.data.message);
        } else {
            alert('选课失败，请重试');
        }
    }
    hideLoading();
}

async function handleDropCourse(courseId) {
    if (isDataLoading) return;

    if (!confirm('确定退选该课程吗?')) return;

    showLoading('正在退课...');
    try {
        var result = await CourseQSortAPI.student.dropCourse(courseId);
        alert(result.message || '退课成功');
        await refreshAll();
    } catch (err) {
        if (err.data && err.data.message) {
            alert(err.data.message);
        } else {
            alert('退课失败，请重试');
        }
    }
    hideLoading();
}

async function filterByFreeSlot(day, period) {
    // 切换选中：如果点击已选中的时段，取消筛选
    if (selectedFreeSlot && selectedFreeSlot.day_of_week === day && selectedFreeSlot.period === period) {
        selectedFreeSlot = null;
        loadCoursePage(1).then(function () { renderCourseList(currentCourses); renderFreeSlots(); });
        return;
    }
    selectedFreeSlot = { day_of_week: day, period: period };
    renderFreeSlots();
    showLoading('正在加载推荐课程...');
    try {
        var data = await CourseQSortAPI.student.getFreeSlotRecommendations(day, period);
        var courses = data.courses || [];
        // 转换为课程列表格式用于渲染
        var displayCourses = courses.map(function (c) {
            var conflict = false;
            var courseBm = buildBitmap(c.time_slots);
            for (var i = 0; i < selectedCourses.length; i++) {
                if (hasBitmapConflict(courseBm, buildBitmap(selectedCourses[i].time_slots))) {
                    conflict = true; break;
                }
            }
            return {
                course_id: c.course_id,
                name: c.name,
                credit: c.credit,
                teacher: c.teacher,
                capacity: c.remaining_capacity + 50,
                enrolled_count: 50,
                remaining_capacity: c.remaining_capacity,
                time_slots: c.time_slots,
                conflict: conflict,
                conflict_with: []
            };
        });
        currentCourses = displayCourses;
        totalCourseCount = displayCourses.length;
        paginationInfo.textContent = '筛选结果 (共 ' + totalCourseCount + ' 门)';
        prevPageBtn.disabled = true;
        nextPageBtn.disabled = true;
        renderCourseList(displayCourses);
    } catch (err) {
        console.error('[App] Filter error:', err);
    }
    hideLoading();
}

// ======================== 冲突浮窗 ========================

function showConflictPopover(e, details) {
    var popover = document.getElementById('conflict-popover');
    var html = '<div class="conflict-popover-content"><strong>冲突课程：</strong><ul>';
    details.forEach(function (d) {
        var slotsStr = d.conflict_slots.map(function (s) {
            var week = ['一', '二', '三', '四', '五'][s.day_of_week - 1];
            return '周' + week + '第' + s.period + '节';
        }).join(', ');
        html += '<li>' + d.course_name + '（' + d.teacher + '）<br><small>' + slotsStr + '</small></li>';
    });
    html += '</ul></div>';
    popover.innerHTML = html;
    popover.style.display = 'block';
    popover.style.left = (e.clientX + 10) + 'px';
    popover.style.top = (e.clientY + 10) + 'px';
}

function hideConflictPopover() {
    document.getElementById('conflict-popover').style.display = 'none';
}

// ======================== 分页事件 ========================

prevPageBtn.addEventListener('click', function () {
    if (currentPage > 1) {
        loadCoursePage(currentPage - 1).then(function () {
            renderCourseList(currentCourses);
        });
    }
});

nextPageBtn.addEventListener('click', function () {
    loadCoursePage(currentPage + 1).then(function () {
        renderCourseList(currentCourses);
    });
});

// ======================== 登出 & 打印 ========================

document.getElementById('logout-btn').addEventListener('click', function () {
    if (CourseQSortAPI.getLoginMode() === 'jwt') {
        CourseQSortAPI.auth.logout();
    }
    CourseQSortAPI.token.clear();
    sessionStorage.clear();
    window.location.replace('index.html');
});

document.getElementById('print-btn').addEventListener('click', function () {
    if (selectedCourses.length === 0) {
        alert('暂无选择课程，无法查看课表');
        return;
    }
    sessionStorage.setItem('selectedCoursesData', JSON.stringify(selectedCourses));
    window.location.href = 'schedule.html';
});

// ======================== 初始化 ========================

initApp();
