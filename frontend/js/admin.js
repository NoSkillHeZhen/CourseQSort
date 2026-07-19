(function() {
    // 预览模式下跳过认证检查，后端模式才需要登录
    if (!CourseQSortAPI.isMockMode() && !CourseQSortAPI.isAuthenticated()) { window.location.href = 'index.html'; return; }
    document.getElementById('admin-mode-badge').textContent = CourseQSortAPI.isMockMode() ? '预览模式' : '后端模式';
})();
var W = ['','周一','周二','周三','周四','周五'];
var P = ['','第1节','第2节','第3节','第4节','第5节','第6节','第7节','第8节','第9节','第10节','第11节'];
var curSec = 'dashboard';
document.querySelectorAll('#admin-nav a[data-section]').forEach(function(l){l.addEventListener('click',function(e){e.preventDefault();switchSec(this.getAttribute('data-section'));});});
document.getElementById('admin-logout-btn').addEventListener('click',function(e){e.preventDefault();CourseQSortAPI.token.clear();sessionStorage.clear();window.location.href='index.html';});
function switchSec(s){curSec=s;document.querySelectorAll('#admin-nav a[data-section]').forEach(function(l){l.classList.remove('active');});document.querySelector('#admin-nav a[data-section="'+s+'"]').classList.add('active');document.querySelectorAll('.admin-section').forEach(function(s){s.classList.add('d-none');});var el=document.getElementById('section-'+s);if(el)el.classList.remove('d-none');if(s==='dashboard')loadDash();else if(s==='courses')loadCourses();else if(s==='resources')loadRes();else if(s==='protected-slots')loadSlots();else if(s==='scheduling')loadPlans();else if(s==='conflict')loadConflict();else if(s==='algorithm')loadAlgo();}
async function loadDash(){try{var c=await CourseQSortAPI.admin.getCourses();var t=await CourseQSortAPI.admin.getTeachers();var r=await CourseQSortAPI.admin.getClassrooms();var m=await CourseQSortAPI.admin.getMajors();var st=await CourseQSortAPI.admin.getStudents().catch(function(){return{count:0};});document.getElementById('dashboard-cards').innerHTML='<div class="col-md-3"><div class="card border-primary border-2 shadow-sm"><div class="card-body position-relative"><i class="bi bi-book stat-icon text-primary"></i><h3 class="display-6 text-primary mb-1">'+(c.count||0)+'</h3><small class="text-muted">课程总数</small></div></div></div><div class="col-md-3"><div class="card border-success border-2 shadow-sm"><div class="card-body position-relative"><i class="bi bi-people stat-icon text-success"></i><h3 class="display-6 text-success mb-1">'+(t.count||0)+'</h3><small class="text-muted">教师数</small></div></div></div><div class="col-md-3"><div class="card border-info border-2 shadow-sm"><div class="card-body position-relative"><i class="bi bi-door-open stat-icon text-info"></i><h3 class="display-6 text-info mb-1">'+(r.count||0)+'</h3><small class="text-muted">教室数</small></div></div></div><div class="col-md-3"><div class="card border-warning border-2 shadow-sm"><div class="card-body position-relative"><i class="bi bi-mortarboard stat-icon text-warning"></i><h3 class="display-6 text-warning mb-1">'+(m.count||0)+'</h3><small class="text-muted">专业数</small></div></div></div>';document.getElementById('dashboard-hint').innerHTML='<i class="bi '+(CourseQSortAPI.isMockMode()?'bi-pc-display':'bi-server')+' me-1"></i>数据来源: '+(CourseQSortAPI.isMockMode()?'本地模拟数据':'后端服务器')+' <span class="ms-2">|</span> <i class="bi bi-person-lines-fill ms-2 me-1"></i>学生数: '+(st.count||0);}catch(e){document.getElementById('dashboard-cards').innerHTML='<div class="col-12 text-danger"><i class="bi bi-exclamation-circle me-1"></i>加载失败: '+e.message+'</div>';}}
var courseData=[],coursePage=1,coursePageSize=15;async function loadCourses(){try{var d=await CourseQSortAPI.admin.getCourses();courseData=d.results||[];coursePage=1;renderCourses();}catch(e){document.getElementById('admin-course-list').innerHTML='<tr><td colspan="9" class="text-danger">加载失败</td></tr>';}}
function renderCourses(){var q=(document.getElementById('course-search').value||'').toLowerCase();var f=courseData;if(q){f=courseData.filter(function(c){return(c.name||'').toLowerCase().indexOf(q)!==-1||(c.code||'').toLowerCase().indexOf(q)!==-1;});coursePage=1;}
var total=f.length,totalPages=Math.ceil(total/coursePageSize);if(coursePage>totalPages)coursePage=totalPages||1;
var start=(coursePage-1)*coursePageSize,end=Math.min(start+coursePageSize,total);
var pageItems=f.slice(start,end);
document.getElementById('admin-course-list').innerHTML=pageItems.map(function(c){var tn=(c.teachers||[]).map(function(t){return t.name;}).join(', ');return'<tr><td><input type="checkbox" class="course-checkbox" data-cid="'+c.id+'"></td><td>'+c.name+'</td><td>'+(c.code||'-')+'</td><td>'+c.credit+'</td><td>'+tn+'</td><td>'+(c.major?c.major.name:'-')+'</td><td>'+(c.expected_student_count||'-')+'</td><td>'+(c.is_professional_course?'专业':'通识')+'</td><td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-course-btn" data-cid="'+c.id+'"><i class="bi bi-pencil-square me-1"></i>编辑</button><button class="btn btn-outline-warning btn-sm py-0 me-1 assign-course-btn" data-cid="'+c.id+'" data-cname="'+c.name+'" title="分配必修"><i class="bi bi-person-plus me-1"></i>分配</button><button class="btn btn-outline-danger btn-sm py-0 del-course-btn" data-cid="'+c.id+'" data-cname="'+c.name+'"><i class="bi bi-trash me-1"></i>删除</button></td></tr>';}).join('')||'<tr><td colspan="9" class="text-muted">暂无数据</td></tr>';
	document.querySelectorAll('.edit-course-btn').forEach(function(b){b.addEventListener('click',function(){var cid=parseInt(this.getAttribute('data-cid'));var c=courseData.find(function(x){return x.id===cid;});if(c)openCourseEditModal(c);});});document.querySelectorAll('.del-course-btn').forEach(function(b){b.addEventListener('click',function(){deleteCourse(parseInt(this.getAttribute('data-cid')),this.getAttribute('data-cname'));});});document.querySelectorAll('.assign-course-btn').forEach(function(b){b.addEventListener('click',function(){openCourseAssignModal(parseInt(this.getAttribute('data-cid')),this.getAttribute('data-cname'));});});
var pi=document.getElementById('admin-course-pagination-info');if(pi)pi.textContent='第 '+coursePage+' 页 / 共 '+totalPages+' 页（共 '+total+' 门课程）';
var pag=document.getElementById('admin-course-pagination');
if(pag){
var links='';
if(coursePage>1)links+='<li class="page-item"><a class="page-link" href="#" data-cp="1">首页</a></li><li class="page-item"><a class="page-link" href="#" data-cp="'+(coursePage-1)+'">上一页</a></li>';
else links+='<li class="page-item disabled"><span class="page-link">首页</span></li><li class="page-item disabled"><span class="page-link">上一页</span></li>';
for(var i=1;i<=totalPages;i++){if(totalPages<=7||i===1||i===totalPages||(i>=coursePage-1&&i<=coursePage+1)){links+='<li class="page-item'+(i===coursePage?' active':'')+'"><a class="page-link" href="#" data-cp="'+i+'">'+i+'</a></li>';}else if(i===coursePage-2||i===coursePage+2){links+='<li class="page-item disabled"><span class="page-link">...</span></li>';}}
if(coursePage<totalPages)links+='<li class="page-item"><a class="page-link" href="#" data-cp="'+(coursePage+1)+'">下一页</a></li><li class="page-item"><a class="page-link" href="#" data-cp="'+totalPages+'">末页</a></li>';
else links+='<li class="page-item disabled"><span class="page-link">下一页</span></li><li class="page-item disabled"><span class="page-link">末页</span></li>';
pag.innerHTML=links;
pag.querySelectorAll('a[data-cp]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();coursePage=parseInt(this.getAttribute('data-cp'));renderCourses();});});
}}
document.getElementById('course-search').addEventListener('input',renderCourses);
// 全选复选框（仅当元素存在时绑定）
var _csa = document.getElementById('course-select-all');
if (_csa) _csa.addEventListener('change',function(){var checked=this.checked;document.querySelectorAll('.course-checkbox').forEach(function(cb){cb.checked=checked;});updateBatchDeleteBtn();});
function updateBatchDeleteBtn(){var any=document.querySelector('.course-checkbox:checked');var bd=document.getElementById('course-batch-delete-btn');if(bd)bd.classList.toggle('d-none',!any);}
var _acl = document.getElementById('admin-course-list');
if (_acl) _acl.addEventListener('change',function(e){if(e.target.classList.contains('course-checkbox')){updateBatchDeleteBtn();}});
var _cbd = document.getElementById('course-batch-delete-btn');
if (_cbd) _cbd.addEventListener('click',function(){var cbs=document.querySelectorAll('.course-checkbox:checked');var ids=[];cbs.forEach(function(cb){ids.push(parseInt(cb.getAttribute('data-cid')));});if(ids.length===0)return;if(!confirm('确定要删除选中的 '+ids.length+' 门课程吗？'))return;var btn=this;btn.disabled=true;CourseQSortAPI.admin.batchDeleteCourses(ids).then(function(r){alert('已删除 '+r.deleted+' 门课程');loadDash();loadCourses();}).catch(function(e){alert('删除失败: '+(e.message||'网络错误'));}).finally(function(){btn.disabled=false;});});
// 全部删除 - 打开密码确认弹窗（仅当元素存在时绑定）
var _cda = document.getElementById('course-delete-all-btn');
if (_cda) _cda.addEventListener('click',function(){document.getElementById('delete-all-password').value='';var modal=new bootstrap.Modal(document.getElementById('delete-all-modal'));modal.show();});
var _dac = document.getElementById('delete-all-confirm-btn');
if (_dac) _dac.addEventListener('click',function(){var pw=document.getElementById('delete-all-password').value;if(!pw){alert('请输入教务密码');return;}var btn=this;btn.disabled=true;CourseQSortAPI.admin.deleteAllCourses(pw).then(function(r){alert('已删除全部 '+r.deleted+' 门课程');bootstrap.Modal.getInstance(document.getElementById('delete-all-modal')).hide();loadDash();loadCourses();}).catch(function(e){var msg=e.message||'网络错误';if(e.data&&e.data.detail)msg=e.data.detail;alert('删除失败: '+msg);}).finally(function(){btn.disabled=false;});});
// ---- 课程 CRUD ----
async function deleteCourse(cid, cname){
    if(!confirm('确定要删除课程「' + cname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteCourse(cid); loadCourses(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}


var _editingCourseId = null;
var _assigningCourseId = null;

function openCourseAssignModal(cid, cname) {
    _assigningCourseId = cid;
    document.getElementById('course-assign-modal-title').innerHTML = '<i class="bi bi-person-plus-fill me-2"></i>分配必修课 - ' + cname;

    // 加载专业列表
    CourseQSortAPI.admin.getMajors().then(function(res) {
        var majors = (res && res.results) ? res.results : [];
        var h = '';
        h += '<div class="mb-3"><label class="form-label fw-semibold"><i class="bi bi-building me-1"></i>目标专业 <small class="text-muted fw-normal">（可选）</small></label>';
        h += '<select class="form-select" id="assign-major" onchange="updateAssignTarget();var mid=parseInt(this.value)||null;loadClassesIntoSelect(mid,document.getElementById(\'assign-class\'),null);"><option value="">-- 不限专业（匹配全部） --</option>';
        for (var i = 0; i < majors.length; i++) {
            h += '<option value="' + majors[i].id + '">' + majors[i].name + '</option>';
        }
        h += '</select></div>';
        h += '<div class="row g-2 mb-3">';
        h += '<div class="col-md-6"><label class="form-label fw-semibold"><i class="bi bi-calendar3 me-1"></i>年级 <small class="text-muted fw-normal">（可选）</small></label><select class="form-select" id="assign-grade" onchange="updateAssignTarget()">' + buildGradeOptions('') + '</select></div>';
        h += '<div class="col-md-6"><label class="form-label fw-semibold"><i class="bi bi-people me-1"></i>班级 <small class="text-muted fw-normal">（先选专业后可选）</small></label><select class="form-select" id="assign-class" onchange="updateAssignTarget()"><option value="">-- 请先选择专业 --</option></select></div>';
        h += '</div>';
        h += '<div class="target-preview" id="assign-target-preview" style="display:none;"></div>';
        h += '<div class="alert alert-warning small mt-3 mb-0 d-flex align-items-center"><i class="bi bi-info-circle-fill me-2 fs-5"></i><span>系统将查找匹配条件的学生，为他们批量创建选课记录并标记为<b>必修</b>。已有选课记录的学生将被跳过。</span></div>';
        document.getElementById('course-assign-modal-body').innerHTML = h;
  }).catch(function(e) {
        document.getElementById('course-assign-modal-body').innerHTML =
            '<div class="mb-3"><label class="form-label fw-semibold"><i class="bi bi-building me-1"></i>目标专业</label><select class="form-select" id="assign-major"><option value="">-- 不限 --</option></select></div>' +
            '<div class="row g-2 mb-3"><div class="col-6"><label class="form-label fw-semibold"><i class="bi bi-calendar3 me-1"></i>年级</label><select class="form-select" id="assign-grade" onchange="updateAssignTarget()">' + buildGradeOptions('') + '</select></div><div class="col-6"><label class="form-label fw-semibold"><i class="bi bi-people me-1"></i>班级</label><select class="form-select" id="assign-class" onchange="updateAssignTarget()"><option value="">-- 请先选择专业 --</option></select></div></div>' +
            '<div class="alert alert-warning small mt-3 mb-0"><i class="bi bi-info-circle-fill me-2"></i>系统将查找匹配条件的学生，批量创建选课记录并标记为<b>必修</b>。</div>';
    });
    new bootstrap.Modal(document.getElementById('course-assign-modal')).show();
}

// 分配目标预览（全局函数，供 onchange/oninput 调用）
window.updateAssignTarget = function() {
    var preview = document.getElementById('assign-target-preview');
    if (!preview) return;
    var majorSel = document.getElementById('assign-major');
    var majorName = majorSel && majorSel.value ? majorSel.options[majorSel.selectedIndex].text : '';
    var gradeSel = document.getElementById('assign-grade');
    var grade = gradeSel ? gradeSel.value : '';
    var classSel = document.getElementById('assign-class');
    var clsName = classSel && classSel.value ? classSel.options[classSel.selectedIndex].text : '';
    var parts = [];
    if (majorSel && majorSel.value) parts.push('<span class="badge bg-primary me-1"><i class="bi bi-building me-1"></i>' + majorName + '</span>');
    if (grade) parts.push('<span class="badge bg-success me-1"><i class="bi bi-calendar3 me-1"></i>' + grade + '级</span>');
    if (classSel && classSel.value) parts.push('<span class="badge bg-info me-1"><i class="bi bi-people me-1"></i>' + clsName + '</span>');
    if (parts.length === 0) { preview.style.display = 'none'; return; }
    preview.style.display = 'block';
    preview.innerHTML = '<div class="d-flex align-items-center"><i class="bi bi-bullseye text-warning me-2"></i><span class="fw-semibold me-2">目标范围：</span>' + parts.join(' ') + '</div><small class="text-muted mt-1 d-block">符合以上条件的学生将被自动分配此课程</small>';
};

document.getElementById('course-assign-modal-save').addEventListener('click', function() {
    if (!_assigningCourseId) return;
    var majorId = document.getElementById('assign-major').value;
    var grade = document.getElementById('assign-grade').value;
    var classSel = document.getElementById('assign-class');
    var classGroupId = classSel ? classSel.value : '';
    var className = classSel && classSel.value ? classSel.options[classSel.selectedIndex].text : '';

    if (!majorId && !grade && !classId) {
        alert('至少需要指定专业、年级或班级之一');
        return;
    }

    var payload = {};
    if (majorId) payload.major_id = parseInt(majorId);
    if (grade) payload.grade = grade;
    if (classGroupId) { payload.class_group_id = parseInt(classGroupId); payload.class_identification = className; }

    var saveBtn = document.getElementById('course-assign-modal-save');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>分配中...';

    CourseQSortAPI.admin.assignCourse(_assigningCourseId, payload).then(function(result) {
        alert(result.message || '分配成功');
        bootstrap.Modal.getInstance(document.getElementById('course-assign-modal')).hide();
  }).catch(function(e) {
        var msg = e.message || '网络错误';
        if (e.data && e.data.detail) msg = e.data.detail;
        alert('分配失败: ' + msg);
    }).finally(function() {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>确定分配';
    });
});

function openCourseEditModal(course) {
    _editingCourseId = course ? course.id : null;
    document.getElementById('course-modal-title').textContent = course ? '编辑课程' : '新增课程';

    // 异步加载教师和专业列表
    Promise.all([
        CourseQSortAPI.admin.getTeachers(),
        CourseQSortAPI.admin.getMajors()
    ]).then(function(res) {
        var teachers = (res[0] && res[0].results) ? res[0].results : [];
        var majors = (res[1] && res[1].results) ? res[1].results : [];
        var curTeacherIds = (course && course.teachers) ? course.teachers.map(function(t){return t.id;}) : [];
        var curMajorId = (course && course.major) ? course.major.id : '';

        var h = '';
        h += '<div class="row g-2 mb-2">';
        h += '<div class="col-md-6"><label class="form-label small">课程名称 <span class="text-danger">*</span></label><input class="form-control form-control-sm" id="c-name" value="' + (course ? (course.name||'') : '') + '"></div>';
        h += '<div class="col-md-3"><label class="form-label small">编号</label><input class="form-control form-control-sm" id="c-code" value="' + (course ? (course.code||'') : '') + '"></div>';
        h += '<div class="col-md-3"><label class="form-label small">学期</label><input class="form-control form-control-sm" id="c-semester" value="' + (course ? (course.semester||'') : '2026-spring') + '"></div>';
        h += '</div>';
        h += '<div class="row g-2 mb-2">';
        h += '<div class="col-md-4"><label class="form-label small">学分</label><input type="number" class="form-control form-control-sm" id="c-credit" value="' + (course ? (course.credit||0) : 3) + '" step="0.5"></div>';
        h += '<div class="col-md-4"><label class="form-label small">学时</label><input type="number" class="form-control form-control-sm" id="c-hours" value="' + (course ? (course.hours||48) : 48) + '"></div>';
        h += '<div class="col-md-4"><label class="form-label small">容量</label><input type="number" class="form-control form-control-sm" id="c-capacity" value="' + (course ? (course.expected_student_count||100) : 100) + '"></div>';
        h += '</div>';
        h += '<div class="row g-2 mb-2">';
        h += '<div class="col-md-4"><label class="form-label small">连排节数 <small class="text-muted">(每次课占几节)</small></label><input type="number" class="form-control form-control-sm" id="c-session-length" value="' + (course ? (course.session_length||2) : 2) + '" min="1" max="6"></div>';
        h += '</div>';
        h += '<div class="row g-2 mb-2">';
        h += '<div class="col-md-6"><label class="form-label small">专业</label><select class="form-select form-select-sm" id="c-major"><option value="">-- 无 --</option>';
        for (var i = 0; i < majors.length; i++) {
            var sel = (majors[i].id === curMajorId) ? ' selected' : '';
            h += '<option value="' + majors[i].id + '"' + sel + '>' + majors[i].name + '</option>';
        }
        h += '</select></div>';
        h += '<div class="col-md-6"><label class="form-label small">课程类别</label><select class="form-select form-select-sm" id="c-is-professional">';
        h += '<option value="1"' + (course && !course.is_professional_course ? '' : ' selected') + '>专业课程</option>';
        h += '<option value="0"' + (course && !course.is_professional_course ? ' selected' : '') + '>通识课程</option>';
        h += '</select></div>';
        h += '</div>';
        h += '<div class="mb-2"><label class="form-label small">教师（可多选）</label><div style="max-height:150px;overflow-y:auto;border:1px solid #dee2e6;border-radius:4px;padding:8px;">';
        for (var i = 0; i < teachers.length; i++) {
            var checked = curTeacherIds.indexOf(teachers[i].id) !== -1 ? ' checked' : '';
            h += '<div class="form-check form-check-inline"><input class="form-check-input c-teacher-cb" type="checkbox" value="' + teachers[i].id + '"' + checked + '><label class="form-check-label small">' + teachers[i].name + '</label></div>';
        }
        if (teachers.length === 0) h += '<span class="text-muted small">暂无教师</span>';
        h += '</div></div>';
        document.getElementById('course-modal-body').innerHTML = h;

        // 如果在 mock 模式下
        if (CourseQSortAPI.isMockMode()) {
        }
  }).catch(function(e) {
        // fallback: 简化表单
        document.getElementById('course-modal-body').innerHTML =
            '<div class="mb-2"><label class="form-label small">课程名称 <span class="text-danger">*</span></label><input class="form-control form-control-sm" id="c-name" value="' + (course ? (course.name||'') : '') + '"></div>' +
            '<div class="mb-2"><label class="form-label small">编号</label><input class="form-control form-control-sm" id="c-code" value="' + (course ? (course.code||'') : '') + '"></div>' +
            '<div class="row g-2 mb-2"><div class="col-6"><label class="form-label small">学分</label><input type="number" class="form-control form-control-sm" id="c-credit" value="' + (course ? (course.credit||0) : 3) + '"></div><div class="col-6"><label class="form-label small">学时</label><input type="number" class="form-control form-control-sm" id="c-hours" value="' + (course ? (course.hours||48) : 48) + '"></div></div>' +
            '<div class="mb-2"><label class="form-label small">容量</label><input type="number" class="form-control form-control-sm" id="c-capacity" value="' + (course ? (course.expected_student_count||100) : 100) + '"></div>' +
            '<div class="mb-2"><label class="form-label small">连排节数</label><input type="number" class="form-control form-control-sm" id="c-session-length" value="' + (course ? (course.session_length||2) : 2) + '" min="1" max="6"></div>' +
            '<div class="mb-2"><label class="form-label small">学期</label><input class="form-control form-control-sm" id="c-semester" value="' + (course ? (course.semester||'') : '2026-spring') + '"></div>' +
            '<div class="mb-2"><label class="form-label small">课程类别</label><select class="form-select form-select-sm" id="c-is-professional"><option value="1"' + (course && !course.is_professional_course ? '' : ' selected') + '>专业课程</option><option value="0"' + (course && !course.is_professional_course ? ' selected' : '') + '>通识课程</option></select></div>';
    });
    new bootstrap.Modal(document.getElementById('course-modal')).show();
}

document.getElementById('course-add-btn').addEventListener('click', function() {
    openCourseEditModal(null);
});

document.getElementById('course-modal-save').addEventListener('click', async function() {
    var name = (document.getElementById('c-name').value || '').trim();
    if (!name) { alert('课程名称不能为空'); return; }
    var majorEl = document.getElementById('c-major');
    var isProfEl = document.getElementById('c-is-professional');
    var teacherCbs = document.querySelectorAll('.c-teacher-cb:checked');
    var teacherIds = [];
    for (var i = 0; i < teacherCbs.length; i++) {
        teacherIds.push(parseInt(teacherCbs[i].value));
    }
    var payload = {
        name: name,
        code: (document.getElementById('c-code').value || '').trim(),
        credit: parseFloat(document.getElementById('c-credit').value) || 0,
        hours: parseInt(document.getElementById('c-hours').value) || 48,
        semester: (document.getElementById('c-semester').value || '').trim(),
        major_id: majorEl ? (parseInt(majorEl.value) || null) : null,
        teacher_ids: teacherIds,
        expected_student_count: parseInt(document.getElementById('c-capacity').value) || 100,
        is_professional_course: isProfEl ? (isProfEl.value === '1') : true,
        session_length: parseInt(document.getElementById('c-session-length').value) || 2,
    };
    try {
        if (_editingCourseId) {
            await CourseQSortAPI.admin.updateCourse(_editingCourseId, payload);
        } else {
            await CourseQSortAPI.admin.createCourse(payload);
        }
        bootstrap.Modal.getInstance(document.getElementById('course-modal')).hide();
        loadCourses();
    } catch(e) {
        alert('保存失败: ' + (e.message || '网络错误'));
    }
});
var _importFile=null;
document.getElementById('course-import-btn').addEventListener('click',function(){
    _importFile=null;
    document.getElementById('json-import-input').value='';
    document.getElementById('import-file-name').style.display='none';
    document.getElementById('import-session-length').value='2';
    document.getElementById('import-start-btn').disabled=true;
    document.getElementById('import-status').className='alert d-none';
    new bootstrap.Modal(document.getElementById('json-import-modal')).show();
});
// 弹窗关闭时清理 backdrop（防止黑屏）
document.getElementById('json-import-modal').addEventListener('hidden.bs.modal',function(){
    setTimeout(function(){
        document.querySelectorAll('.modal-backdrop').forEach(function(b){b.remove();});
        document.body.classList.remove('modal-open');
        document.body.style.overflow='';
        document.body.style.paddingRight='';
    },100);
});
// 拖放区域
// 拖放区域 — 全局拦截 + 自动弹出导入窗口
var _dragModalShown=false;
document.addEventListener('dragover',function(e){e.preventDefault();if(!_dragModalShown){_dragModalShown=true;document.getElementById('course-import-btn').click();}});
document.addEventListener('dragleave',function(e){if(!e.relatedTarget)_dragModalShown=false;});
document.addEventListener('drop',function(e){e.preventDefault();_dragModalShown=false;});
var _dropZone=document.getElementById('import-drop-zone');
_dropZone.addEventListener('click',function(e){if(e.target.id!=='json-import-input')document.getElementById('json-import-input').click();});
_dropZone.addEventListener('dragover',function(e){e.preventDefault();this.classList.add('drag-over');});
_dropZone.addEventListener('dragleave',function(){this.classList.remove('drag-over');});
_dropZone.addEventListener('drop',function(e){e.preventDefault();this.classList.remove('drag-over');var file=e.dataTransfer.files[0];if(file){if(!file.name.toLowerCase().endsWith('.json')){alert('仅支持 JSON 文件');return;}_importFile=file;document.getElementById('import-file-name').textContent='✓ '+file.name+' ('+(file.size/1024).toFixed(1)+' KB)';document.getElementById('import-file-name').style.display='block';document.getElementById('import-start-btn').disabled=false;}});
document.getElementById('json-import-input').addEventListener('change',function(){var file=this.files[0];if(!file)return;if(!file.name.toLowerCase().endsWith('.json')){alert('请选择 JSON 文件（.json）');this.value='';return;}_importFile=file;document.getElementById('import-file-name').textContent='✓ '+file.name+' ('+(file.size/1024).toFixed(1)+' KB)';document.getElementById('import-file-name').style.display='block';document.getElementById('import-start-btn').disabled=false;});
// 开始导入按钮
document.getElementById('import-start-btn').addEventListener('click',function(){
    if(!_importFile)return;
    var btn=this,statusEl=document.getElementById('import-status');
    btn.disabled=true;btn.innerHTML='<span class="spinner-border spinner-border-sm me-1"></span>导入中...';
    statusEl.className='alert alert-info mt-3 mb-0';statusEl.textContent='正在导入，请稍候...';
    var sl=parseInt(document.getElementById('import-session-length').value)||0;
    CourseQSortAPI.admin.importCoursesJSON(_importFile,sl||null).then(function(r){
        statusEl.className='alert alert-success mt-3 mb-0';
        statusEl.innerHTML='<i class="bi bi-check-circle me-1"></i>导入成功！共导入 <strong>'+(r.imported_count||0)+'</strong> 门课程，处理 <strong>'+(r.total_records||0)+'</strong> 条记录';
        loadDash();loadCourses();
        setTimeout(function(){
            var modalEl=document.getElementById('json-import-modal');
            var modal=bootstrap.Modal.getInstance(modalEl);
            if(modal)modal.hide();
            // 手动清理残留的 backdrop 和 body 样式
            setTimeout(function(){
                document.querySelectorAll('.modal-backdrop').forEach(function(b){b.remove();});
                document.body.classList.remove('modal-open');
                document.body.style.overflow='';
                document.body.style.paddingRight='';
            },200);
        },1500);
    }).catch(function(e){
        var msg=e.message||'网络错误';if(e.data&&e.data.detail)msg=e.data.detail;
        statusEl.className='alert alert-danger mt-3 mb-0';
        statusEl.innerHTML='<i class="bi bi-exclamation-circle me-1"></i>导入失败: '+msg;
    }).finally(function(){
        btn.disabled=false;btn.innerHTML='<i class="bi bi-check-lg me-1"></i>开始导入';
    });
});
document.getElementById('course-export-btn').addEventListener('click',async function(){try{var data=await CourseQSortAPI.admin.exportCoursesJSON();var blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});var url=URL.createObjectURL(blob);var a=document.createElement('a');a.href=url;a.download='courses_export.json';a.click();URL.revokeObjectURL(url);}catch(e){alert('导出失败: '+(e.message||'网络错误'));}});
var curRes='teachers';document.querySelectorAll('#resource-tabs a').forEach(function(t){t.addEventListener('click',function(e){e.preventDefault();document.querySelectorAll('#resource-tabs a').forEach(function(x){x.classList.remove('active');});this.classList.add('active');curRes=this.getAttribute('data-resource');var tdf=document.getElementById('teacher-dept-filter');if(tdf)tdf.classList.toggle('d-none',curRes!=='teachers');var sf=document.getElementById('student-filter');if(sf)sf.classList.toggle('d-none',curRes!=='students');var cf=document.getElementById('classgroup-major-filter');if(cf)cf.classList.toggle('d-none',curRes!=='classgroups');loadResTable();});});
async function loadRes(){await loadResTable();}

// ---- 资源 导入/导出 ----
var _resApiMap = {
    teachers: { exportFn: 'exportTeachersJSON', importFn: 'importTeachersJSON', label: 'teachers' },
    students: { exportFn: 'exportStudentsJSON', importFn: 'importStudentsJSON', label: 'students' },
    classrooms: { exportFn: 'exportClassroomsJSON', importFn: 'importClassroomsJSON', label: 'classrooms' },
    majors: { exportFn: 'exportMajorsJSON', importFn: 'importMajorsJSON', label: 'majors' },
    classgroups: { exportFn: 'exportClassGroupsJSON', importFn: 'importClassGroupsJSON', label: 'class_groups' },
    'course-assignments': { exportFn: 'exportCourseAssignmentsJSON', importFn: 'importCourseAssignmentsJSON', label: 'course_assignments' }
};
document.getElementById('resource-import-btn').addEventListener('click', function () {
    document.getElementById('resource-import-input').click();
});
document.getElementById('resource-import-input').addEventListener('change', function () {
    var file = this.files[0];
    if (!file) return;
    var map = _resApiMap[curRes];
    if (!map) { alert('当前标签不支持导入'); this.value = ''; return; }
    var btn = document.getElementById('resource-import-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>导入中...';
    CourseQSortAPI.admin[map.importFn](file).then(function (r) {
        alert('导入完成！新增 ' + (r.imported || 0) + ' / 共 ' + (r.total || 0) + ' 条');
        loadResTable();
    }).catch(function (e) {
        var msg = e.message || '网络错误';
        if (e.data && e.data.detail) msg = e.data.detail;
        alert('导入失败: ' + msg);
    }).finally(function () { btn.disabled = false; btn.innerHTML = '<i class="bi bi-file-earmark-arrow-up me-1"></i>导入'; this.value = ''; });
});
document.getElementById('resource-export-btn').addEventListener('click', function () {
    var map = _resApiMap[curRes];
    if (!map) { alert('当前标签不支持导出'); return; }
    CourseQSortAPI.admin[map.exportFn]().then(function (data) {
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = map.label + '_export.json';
        a.click(); URL.revokeObjectURL(url);
    }).catch(function (e) { alert('导出失败: ' + (e.message || '网络错误')); });
});

// ---- 教师 CRUD ----
var _editingTeacherId=null;
function openTeacherEditModal(teacher){
    _editingTeacherId = teacher ? teacher.id : null;
    var name = teacher ? (teacher.name||'') : '';
    var eno = teacher ? (teacher.employee_no||'') : '';
    var dept = teacher ? (teacher.department||'') : '';
    var slots = teacher ? (teacher.unavailable_slots||[]) : [];
    var title = teacher ? '编辑教师信息' : '新增教师';
    document.getElementById('teacher-edit-modal-title').textContent = title;

    var h = '';
    h += '<div class="row g-2 mb-3">';
    h += '<div class="col-md-4"><label class="form-label small">姓名 <span class="text-danger">*</span></label><input class="form-control form-control-sm" id="te-name" value="' + name + '"></div>';
    h += '<div class="col-md-4"><label class="form-label small">工号</label><input class="form-control form-control-sm" id="te-eno" value="' + eno + '"></div>';
    h += '<div class="col-md-4"><label class="form-label small">学院</label><input class="form-control form-control-sm" id="te-dept" value="' + dept + '"></div>';
    h += '</div>';
    h += '<p class="small text-muted mb-1">禁排时段（勾选不可排课的时间格）：</p>';
    h += '<div class="table-responsive"><table class="table table-bordered table-sm text-center mb-0"><thead><tr><th></th>';
    for(var d=1;d<=5;d++) h += '<th>' + W[d] + '</th>';
    h += '</tr></thead><tbody>';
    for(var p=1;p<=11;p++){
        h += '<tr><td class="bg-light small">' + P[p] + '</td>';
        for(var d=1;d<=5;d++){
            var ck = '';
            for(var i=0;i<slots.length;i++){
                if(slots[i].day_of_week===d && slots[i].period===p){ ck=' checked'; break; }
            }
            h += '<td style="padding:1px;"><input type="checkbox" class="te-slot-cb" data-day="'+d+'" data-period="'+p+'"'+ck+'></td>';
        }
        h += '</tr>';
    }
    h += '</tbody></table></div>';
    document.getElementById('teacher-edit-modal-body').innerHTML = h;
    new bootstrap.Modal(document.getElementById('teacher-edit-modal')).show();
}
document.getElementById('teacher-edit-modal-save').addEventListener('click', async function(){
    var name = document.getElementById('te-name').value.trim();
    if(!name){ alert('姓名不能为空'); return; }
    var eno = document.getElementById('te-eno').value.trim();
    var dept = document.getElementById('te-dept').value.trim();
    var slots = [];
    document.querySelectorAll('.te-slot-cb:checked').forEach(function(cb){
        slots.push({day_of_week: parseInt(cb.getAttribute('data-day')), period: parseInt(cb.getAttribute('data-period'))});
    });
    var payload = { name: name, employee_no: eno, department: dept, unavailable_slots: slots };
    try {
        if(_editingTeacherId){
            await CourseQSortAPI.admin.updateTeacher(_editingTeacherId, payload);
        } else {
            await CourseQSortAPI.admin.createTeacher(payload);
        }
        bootstrap.Modal.getInstance(document.getElementById('teacher-edit-modal')).hide();
        loadResTable();
    } catch(e) {
        alert('保存失败: ' + (e.message || '网络错误'));
    }
});

async function deleteTeacher(tid, tname){
    if(!confirm('确定要删除教师「' + tname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteTeacher(tid); loadResTable(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}

// ---- 学生 CRUD ----
var _editingStudentId=null;

function openStudentEditModal(student){
    _editingStudentId = student ? student.id : null;
    document.getElementById('student-edit-modal-title').textContent = student ? '编辑学生信息' : '新增学生';
    document.getElementById('student-edit-id').value = student ? student.id : '';
    document.getElementById('student-edit-name').value = student ? (student.name||'') : '';
    document.getElementById('student-edit-no').value = student ? (student.student_no||'') : '';
    // 年级下拉
    document.getElementById('student-edit-grade').innerHTML = buildGradeOptions(student ? student.grade : '');
    // 专业 + 班级级联
    var majorSel = document.getElementById('student-edit-major');
    var classSel = document.getElementById('student-edit-class');
    var savedMajorId = student ? student.major : null;
    var savedClassGroupId = student ? student.class_group : null;

    majorSel.onchange = function() { loadClassesIntoSelect(parseInt(this.value)||null, classSel, null); };

    CourseQSortAPI.admin.getMajors().then(function(d){
        var majors = d.results || [];
        majorSel.innerHTML = '<option value="">-- 选择专业 --</option>' + majors.map(function(m){
            var sel = savedMajorId === m.id ? ' selected' : '';
            return '<option value="'+m.id+'"'+sel+'>'+m.name+'</option>';
        }).join('');
        var initMajorId = savedMajorId || (majors.length > 0 ? majors[0].id : null);
        if (initMajorId) loadClassesIntoSelect(initMajorId, classSel, savedClassGroupId);
  }).catch(function(){});
    new bootstrap.Modal(document.getElementById('student-edit-modal')).show();
}

document.getElementById('student-edit-modal-save').addEventListener('click', async function(){
    var name = document.getElementById('student-edit-name').value.trim();
    var no = document.getElementById('student-edit-no').value.trim();
    if(!name){ alert('姓名不能为空'); return; }
    if(!no){ alert('学号不能为空'); return; }
    var classGroupId = parseInt(document.getElementById('student-edit-class').value) || null;
    var payload = {
        name: name,
        student_no: no,
        major: parseInt(document.getElementById('student-edit-major').value) || null,
        grade: document.getElementById('student-edit-grade').value,
        class_group: classGroupId,
        class_identification: (function(){var sel=document.getElementById('student-edit-class');return sel&&sel.selectedIndex>=0?sel.options[sel.selectedIndex].text:'';})()
    };
    try {
        if(_editingStudentId){
            await CourseQSortAPI.admin.updateStudent(_editingStudentId, payload);
        } else {
            await CourseQSortAPI.admin.createStudent(payload);
        }
        bootstrap.Modal.getInstance(document.getElementById('student-edit-modal')).hide();
        loadResTable();
    } catch(e) {
        alert('保存失败: ' + (e.message || '网络错误'));
    }
});

async function deleteStudent(sid, sname){
    if(!confirm('确定要删除学生「' + sname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteStudent(sid); loadResTable(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}

// ---- 班级 CRUD ----
function openClassGroupEditModal(cg, lockedMajorId, lockedMajorName){
    _editingClassGroupId = cg ? cg.id : null;
    _lockedClassGroupMajorId = lockedMajorId || (cg ? cg.major : null);
    _lockedClassGroupMajorName = lockedMajorName || (cg ? cg.major_name : '');
    document.getElementById('classgroup-edit-modal-title').textContent = cg ? '编辑班级' : '新增班级';
    document.getElementById('classgroup-edit-id').value = cg ? cg.id : '';
    document.getElementById('classgroup-edit-name').value = cg ? (cg.name||'') : '';
    document.getElementById('classgroup-edit-grade').innerHTML = buildGradeOptions(cg ? cg.grade : '');
    // 专业锁定，显示为只读文本
    var majorSel = document.getElementById('classgroup-edit-major');
    majorSel.innerHTML = '<option value="' + (_lockedClassGroupMajorId||'') + '">' + (_lockedClassGroupMajorName || '（已锁定）') + '</option>';
    majorSel.disabled = true;
    new bootstrap.Modal(document.getElementById('classgroup-edit-modal')).show();
}

var _lockedClassGroupMajorId = null;
var _lockedClassGroupMajorName = '';

// ---- 通用辅助：年级下拉 + 班级级联 ----
function buildGradeOptions(selectedGrade) {
    selectedGrade = selectedGrade || '';
    var currentYear = new Date().getFullYear();
    var html = '<option value="">-- 选择年级 --</option>';
    for (var y = currentYear + 2; y >= 1970; y--) {
        var ys = String(y);
        html += '<option value="' + ys + '"' + (ys === selectedGrade ? ' selected' : '') + '>' + ys + '级</option>';
    }
    return html;
}

function loadClassesIntoSelect(majorId, selectEl, selectedClassGroupId) {
    if (!majorId) {
        selectEl.innerHTML = '<option value="">-- 请先选择专业 --</option>';
        return;
    }
    CourseQSortAPI.admin.getMajorClasses(majorId).then(function(classes) {
        var list = Array.isArray(classes) ? classes : (classes.results || []);
        selectEl.innerHTML = '<option value="">-- 选择班级 --</option>' +
            list.map(function(cg) {
                var sel = selectedClassGroupId === cg.id ? ' selected' : '';
                return '<option value="' + cg.id + '"' + sel + '>' + cg.name + '</option>';
            }).join('');
  }).catch(function() {
        selectEl.innerHTML = '<option value="">-- 加载失败 --</option>';
    });
}

document.getElementById('classgroup-edit-modal-save').addEventListener('click', async function(){
    var name = document.getElementById('classgroup-edit-name').value.trim();
    if(!name){ alert('班级名称不能为空'); return; }
    if(!_lockedClassGroupMajorId){ alert('请先在专业筛选中选择专业'); return; }
    var payload = {
        name: name,
        major: _lockedClassGroupMajorId,
        grade: document.getElementById('classgroup-edit-grade').value
    };
    try {
        if(_editingClassGroupId){
            await CourseQSortAPI.admin.updateClassGroup(_editingClassGroupId, payload);
        } else {
            await CourseQSortAPI.admin.createClassGroup(payload);
        }
        bootstrap.Modal.getInstance(document.getElementById('classgroup-edit-modal')).hide();
        loadResTable();
    } catch(e) { alert('保存失败: ' + (e.message || '网络错误')); }
});

async function deleteClassGroup(cgid, cgname, majorId){
    if(!confirm('确定要删除班级「' + cgname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteClassGroup(cgid); loadResTable(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}

// ---- 课室编辑弹窗 ----
function openClassroomEditModal(room){
    var title = document.getElementById('classroom-edit-modal-title');
    if(room){
        title.textContent = '编辑课室';
        document.getElementById('classroom-edit-id').value = room.id;
        document.getElementById('classroom-edit-name').value = room.name || '';
        document.getElementById('classroom-edit-capacity').value = room.capacity || 60;
        document.getElementById('classroom-edit-building').value = room.building || '';
        document.getElementById('classroom-edit-equipment').value = (room.equipment_types||[]).join(', ');
        document.getElementById('classroom-edit-islab').checked = room.is_lab || false;
    } else {
        title.textContent = '新增课室';
        document.getElementById('classroom-edit-id').value = '';
        document.getElementById('classroom-edit-name').value = '';
        document.getElementById('classroom-edit-capacity').value = '60';
        document.getElementById('classroom-edit-building').value = '';
        document.getElementById('classroom-edit-equipment').value = '';
        document.getElementById('classroom-edit-islab').checked = false;
    }
    new bootstrap.Modal(document.getElementById('classroom-edit-modal')).show();
}
document.getElementById('classroom-edit-modal-save').addEventListener('click', async function(){
    var id = document.getElementById('classroom-edit-id').value;
    var data = {
        name: document.getElementById('classroom-edit-name').value.trim(),
        capacity: parseInt(document.getElementById('classroom-edit-capacity').value) || 60,
        building: document.getElementById('classroom-edit-building').value.trim(),
        equipment_types: document.getElementById('classroom-edit-equipment').value.split(',').map(function(s){return s.trim();}).filter(Boolean),
        is_lab: document.getElementById('classroom-edit-islab').checked
    };
    if(!data.name){ alert('请输入课室名称'); return; }
    try {
        if(id){ await CourseQSortAPI.admin.updateClassroom(parseInt(id), data); }
        else { await CourseQSortAPI.admin.createClassroom(data); }
        bootstrap.Modal.getInstance(document.getElementById('classroom-edit-modal')).hide();
        loadResTable();
    } catch(e) { alert('保存失败: ' + (e.message || '网络错误')); }
});
async function deleteClassroom(rid, rname){
    if(!confirm('确定要删除课室「' + rname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteClassroom(rid); loadResTable(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}

// ---- 专业编辑弹窗 ----
function openMajorEditModal(major){
    var title = document.getElementById('major-edit-modal-title');
    if(major){
        title.textContent = '编辑专业';
        document.getElementById('major-edit-id').value = major.id;
        document.getElementById('major-edit-name').value = major.name || '';
        document.getElementById('major-edit-code').value = major.code || '';
        document.getElementById('major-edit-count').value = major.student_count || 0;
    } else {
        title.textContent = '新增专业';
        document.getElementById('major-edit-id').value = '';
        document.getElementById('major-edit-name').value = '';
        document.getElementById('major-edit-code').value = '';
        document.getElementById('major-edit-count').value = '0';
    }
    new bootstrap.Modal(document.getElementById('major-edit-modal')).show();
}
document.getElementById('major-edit-modal-save').addEventListener('click', async function(){
    var id = document.getElementById('major-edit-id').value;
    var data = {
        name: document.getElementById('major-edit-name').value.trim(),
        code: document.getElementById('major-edit-code').value.trim(),
        student_count: parseInt(document.getElementById('major-edit-count').value) || 0
    };
    if(!data.name){ alert('请输入专业名称'); return; }
    try {
        if(id){ await CourseQSortAPI.admin.updateMajor(parseInt(id), data); }
        else { await CourseQSortAPI.admin.createMajor(data); }
        bootstrap.Modal.getInstance(document.getElementById('major-edit-modal')).hide();
        loadResTable();
    } catch(e) { alert('保存失败: ' + (e.message || '网络错误')); }
});
async function deleteMajor(mid, mname){
    if(!confirm('确定要删除专业「' + mname + '」吗？此操作不可恢复。')) return;
    try { await CourseQSortAPI.admin.deleteMajor(mid); loadResTable(); }
    catch(e) { alert('删除失败: ' + (e.message || '网络错误')); }
}

var resPageData=[],resPage=1,resPageSize=15,_curResRender=null;
function renderResPagination(){var total=resPageData.length,totalPages=Math.ceil(total/resPageSize);if(resPage>totalPages)resPage=totalPages||1;var info=document.getElementById('resource-pagination-info'),pag=document.getElementById('resource-pagination'),bar=document.getElementById('resource-pagination-bar');if(total<=resPageSize){if(bar)bar.style.display='none';return;}if(bar)bar.style.display='';if(info)info.textContent='第 '+resPage+' 页 / 共 '+totalPages+' 页（共 '+total+' 条）';if(!pag)return;var links='';if(resPage>1)links+='<li class="page-item"><a class="page-link" href="#" data-rp="1">首页</a></li><li class="page-item"><a class="page-link" href="#" data-rp="'+(resPage-1)+'">上一页</a></li>';else links+='<li class="page-item disabled"><span class="page-link">首页</span></li><li class="page-item disabled"><span class="page-link">上一页</span></li>';for(var i=1;i<=totalPages;i++){if(totalPages<=7||i===1||i===totalPages||(i>=resPage-1&&i<=resPage+1)){links+='<li class="page-item'+(i===resPage?' active':'')+'"><a class="page-link" href="#" data-rp="'+i+'">'+i+'</a></li>';}else if(i===resPage-2||i===resPage+2){links+='<li class="page-item disabled"><span class="page-link">...</span></li>';}}if(resPage<totalPages)links+='<li class="page-item"><a class="page-link" href="#" data-rp="'+(resPage+1)+'">下一页</a></li><li class="page-item"><a class="page-link" href="#" data-rp="'+totalPages+'">末页</a></li>';else links+='<li class="page-item disabled"><span class="page-link">下一页</span></li><li class="page-item disabled"><span class="page-link">末页</span></li>';pag.innerHTML=links;pag.querySelectorAll('a[data-rp]').forEach(function(a){a.addEventListener('click',function(e){e.preventDefault();resPage=parseInt(this.getAttribute('data-rp'));if(_curResRender)_curResRender();renderResPagination();});});}
function getResPageItems(){var start=(resPage-1)*resPageSize;return resPageData.slice(start,start+resPageSize);}
function renderResPage(){if(_curResRender)_curResRender();renderResPagination();}
async function loadResTable(){
    var tb = document.getElementById('resource-table-body');
    var addBtn = document.getElementById('resource-add-btn');
    resPage=1;
    // 显示/隐藏对应标签的筛选栏
    var tdf=document.getElementById('teacher-dept-filter');if(tdf)tdf.classList.toggle('d-none',curRes!=='teachers');
    var sf=document.getElementById('student-filter');if(sf)sf.classList.toggle('d-none',curRes!=='students');
    var cf=document.getElementById('classgroup-major-filter');if(cf)cf.classList.toggle('d-none',curRes!=='classgroups');
    try {
        if(curRes==='teachers'){
            addBtn.classList.remove('d-none');
            addBtn.textContent = '新增教师';
            addBtn.onclick = function(){ openTeacherEditModal(null); };
            var d = await CourseQSortAPI.admin.getTeachers();
            var allTeachers = d.results || [];
            // 填充学院筛选下拉
            var deptSel = document.getElementById('teacher-filter-dept');
            var deptHint = document.getElementById('teacher-filter-hint');
            var depts = [];
            allTeachers.forEach(function(t){ var dept=t.department||''; if(dept&&depts.indexOf(dept)===-1)depts.push(dept); });
            deptSel.innerHTML = '<option value="">全部学院</option>' + depts.map(function(dep){ return '<option value="'+dep+'">'+dep+'</option>'; }).join('');
            function applyTeacherFilter(){
                var selDept = deptSel.value;
                resPageData = selDept ? allTeachers.filter(function(t){ return (t.department||'') === selDept; }) : allTeachers.slice();
                resPage=1;
                if(deptHint)deptHint.textContent = '共 ' + resPageData.length + ' 人';
                renderResPage();
            }
            deptSel.onchange = applyTeacherFilter;
            // 初始加载
            applyTeacherFilter();
            _curResRender = function() {
                var items = getResPageItems();
                tb.innerHTML = '<tr><th>姓名</th><th>工号</th><th>学院</th><th>禁排时段</th><th>操作</th></tr>' + items.map(function(t){
                    var s = (t.unavailable_slots||[]).map(function(s){return'周'+['','一','二','三','四','五'][s.day_of_week]+'第'+s.period+'节';}).join(', ')||'无';
                    var sc = t.unavailable_slots ? t.unavailable_slots.length : '0';
                    return '<tr><td>' + t.name + '</td><td>' + (t.employee_no||'-') + '</td><td>' + (t.department||'-') +
                        '</td><td class="small">' + s + ' <span class="badge bg-secondary">' + sc + '个</span></td>' +
                        '<td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-teacher-btn" data-tid="' + t.id + '">编辑</button>' +
                        '<button class="btn btn-outline-danger btn-sm py-0 del-teacher-btn" data-tid="' + t.id + '" data-tname="' + t.name + '">删除</button></td></tr>';
                }).join('') || '<tr><td colspan="5" class="text-muted">暂无教师数据</td></tr>';
                document.querySelectorAll('.edit-teacher-btn').forEach(function(b){
                    b.addEventListener('click', function(){
                        var tid = parseInt(this.getAttribute('data-tid'));
                        var teacher = allTeachers.find(function(t){return t.id===tid;});
                        if(teacher) openTeacherEditModal(teacher);
                    });
                });
                document.querySelectorAll('.del-teacher-btn').forEach(function(b){
                    b.addEventListener('click', function(){
                        deleteTeacher(parseInt(this.getAttribute('data-tid')), this.getAttribute('data-tname'));
                    });
                });
            };
        } else if(curRes==='students'){
            addBtn.classList.remove('d-none');
            addBtn.textContent = '新增学生';
            addBtn.onclick = function(){ openStudentEditModal(null); };
            var d = await CourseQSortAPI.admin.getStudents();
            var allStudents = d.results || [];
            // 填充筛选下拉
            var gradeSel = document.getElementById('student-filter-grade');
            var majorSel = document.getElementById('student-filter-major');
            var classSel = document.getElementById('student-filter-class');
            var stuHint = document.getElementById('student-filter-hint');
            var grades = [], majors = [], classes = [];
            allStudents.forEach(function(s){
                var g = s.grade||''; if(g && grades.indexOf(g)===-1) grades.push(g);
                var m = s.major_name||''; if(m && majors.indexOf(m)===-1) majors.push(m);
                var c = s.class_name||s.class_identification||''; if(c && classes.indexOf(c)===-1) classes.push(c);
            });
            grades.sort(); majors.sort(); classes.sort();
            gradeSel.innerHTML = '<option value="">全部年级</option>' + grades.map(function(g){ return '<option value="'+g+'">'+g+'级</option>'; }).join('');
            majorSel.innerHTML = '<option value="">全部专业</option>' + majors.map(function(m){ return '<option value="'+m+'">'+m+'</option>'; }).join('');
            classSel.innerHTML = '<option value="">全部班级</option>' + classes.map(function(c){ return '<option value="'+c+'">'+c+'</option>'; }).join('');
            function applyStudentFilter(){
                var selGrade = gradeSel.value;
                var selMajor = majorSel.value;
                var selClass = classSel.value;
                resPageData = allStudents.filter(function(s){
                    if(selGrade && (s.grade||'') !== selGrade) return false;
                    if(selMajor && (s.major_name||'') !== selMajor) return false;
                    if(selClass && (s.class_name||s.class_identification||'') !== selClass) return false;
                    return true;
                });
                resPage=1;
                if(stuHint)stuHint.textContent = '共 ' + resPageData.length + ' 人';
                renderResPage();
            }
            gradeSel.onchange = applyStudentFilter;
            majorSel.onchange = applyStudentFilter;
            classSel.onchange = applyStudentFilter;
            // 初始加载
            applyStudentFilter();
            _curResRender = function() { var items = getResPageItems();
            tb.innerHTML = '<tr><th>学号</th><th>姓名</th><th>专业</th><th>年级</th><th>班级</th><th>操作</th></tr>' + items.map(function(s){
                return '<tr><td>' + (s.student_no||'-') + '</td><td>' + s.name + '</td><td>' + (s.major_name||'-') +
                    '</td><td>' + (s.grade||'-') + '</td><td>' + (s.class_name||s.class_identification||'-') +
                    '</td><td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-student-btn" data-sid="' + s.id + '">编辑</button>' +
                    '<button class="btn btn-outline-danger btn-sm py-0 del-student-btn" data-sid="' + s.id + '" data-sname="' + s.name + '">删除</button></td></tr>';
            }).join('') || '<tr><td colspan="6" class="text-muted">暂无学生数据</td></tr>';
            document.querySelectorAll('.edit-student-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    var sid = parseInt(this.getAttribute('data-sid'));
                    var stu = allStudents.find(function(s){return s.id===sid;});
                    if(stu) openStudentEditModal(stu);
                });
            });
            document.querySelectorAll('.del-student-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    deleteStudent(parseInt(this.getAttribute('data-sid')), this.getAttribute('data-sname'));
                });
            });
            }; renderResPage();
	        } else if(curRes==='classrooms'){
            addBtn.classList.remove('d-none');
            addBtn.textContent = '新增课室';
            addBtn.onclick = function(){ openClassroomEditModal(null); };
            var d = await CourseQSortAPI.admin.getClassrooms();
            resPageData = d.results || []; _curResRender = function() { var items = getResPageItems();
            tb.innerHTML = '<tr><th>名称</th><th>容量</th><th>楼宇</th><th>设备</th><th>类型</th><th>操作</th></tr>' + items.map(function(r){
                return '<tr><td>' + r.name + '</td><td>' + r.capacity + '</td><td>' + (r.building||'-') +
                    '</td><td class="small">' + (r.equipment_types||[]).join(', ') + '</td><td>' + (r.is_lab?'实验室':'普通') +
                    '</td><td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-room-btn" data-rid="' + r.id + '">编辑</button>' +
                    '<button class="btn btn-outline-danger btn-sm py-0 del-room-btn" data-rid="' + r.id + '" data-rname="' + r.name + '">删除</button></td></tr>';
            }).join('') || '<tr><td colspan="6" class="text-muted">暂无课室数据</td></tr>';
            document.querySelectorAll('.edit-room-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    var rid = parseInt(this.getAttribute('data-rid'));
                    var room = resPageData.find(function(r){return r.id===rid;});
                    if(room) openClassroomEditModal(room);
                });
            });
            document.querySelectorAll('.del-room-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    deleteClassroom(parseInt(this.getAttribute('data-rid')), this.getAttribute('data-rname'));
                });
            });
            }; renderResPage();
        } else if(curRes==='majors'){
            addBtn.classList.remove('d-none');
            addBtn.textContent = '新增专业';
            addBtn.onclick = function(){ openMajorEditModal(null); };
            var d = await CourseQSortAPI.admin.getMajors();
            resPageData = d.results || []; _curResRender = function() { var items = getResPageItems();
            tb.innerHTML = '<tr><th>名称</th><th>编号</th><th>学生数</th><th>操作</th></tr>' + items.map(function(m){
                return '<tr><td>' + m.name + '</td><td>' + (m.code||'-') + '</td><td>' + (m.student_count||0) +
                    '</td><td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-major-btn" data-mid="' + m.id + '">编辑</button>' +
                    '<button class="btn btn-outline-danger btn-sm py-0 del-major-btn" data-mid="' + m.id + '" data-mname="' + m.name + '">删除</button></td></tr>';
            }).join('') || '<tr><td colspan="4" class="text-muted">暂无专业数据</td></tr>';
            document.querySelectorAll('.edit-major-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    var mid = parseInt(this.getAttribute('data-mid'));
                    var major = resPageData.find(function(m){return m.id===mid;});
                    if(major) openMajorEditModal(major);
                });
            });
            document.querySelectorAll('.del-major-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    deleteMajor(parseInt(this.getAttribute('data-mid')), this.getAttribute('data-mname'));
                });
            });
            }; renderResPage();
        } else if(curRes==='classgroups'){
            // 显示专业筛选，隐藏通用新增按钮
            addBtn.classList.add('d-none');
            var filterDiv = document.getElementById('classgroup-major-filter');
            if (filterDiv) filterDiv.classList.remove('d-none');
            // 加载专业到筛选下拉
            var filterSel = document.getElementById('classgroup-filter-major');
            var filterGrade = document.getElementById('classgroup-filter-grade');
            var filterHint = document.getElementById('classgroup-filter-hint');
            var savedFilterMajorId = sessionStorage.getItem('classgroupFilterMajor') || '';
            var savedFilterGrade = sessionStorage.getItem('classgroupFilterGrade') || '';
            var majorsData = await CourseQSortAPI.admin.getMajors();
            var majors = majorsData.results || [];
            filterSel.innerHTML = '<option value="">-- 选择专业 --</option>' +
                majors.map(function(m) {
                    var sel = (String(m.id) === savedFilterMajorId) ? ' selected' : '';
                    return '<option value="' + m.id + '"' + sel + '>' + m.name + '</option>';
                }).join('');
            filterGrade.innerHTML = buildGradeOptions(savedFilterGrade);

            // 渲染班级列表的辅助函数
            function renderClassGroupTable(majorId) {
                if (!majorId) {
                    var rpb = document.getElementById('resource-pagination-bar'); if (rpb) rpb.style.display='none'; tb.innerHTML = '<tr><td colspan="3" class="text-muted">请先选择专业</td></tr>';
                    addBtn.classList.add('d-none');
                    if (filterHint) filterHint.textContent = '';
                    return;
                }
                CourseQSortAPI.admin.getMajorClasses(parseInt(majorId)).then(function(classes) {
                    var allData = Array.isArray(classes) ? classes : (classes.results || []);
                    // 按年级筛选
                    var selGrade = filterGrade.value;
                    if (selGrade) {
                        allData = allData.filter(function(cg) { return (cg.grade || '') === selGrade; });
                    }
                    resPageData = allData; _curResRender = function() { var items = getResPageItems();
                    addBtn.classList.remove('d-none');
                    addBtn.textContent = '新增班级';
                    var majorName = filterSel.options[filterSel.selectedIndex].text;
                    addBtn.onclick = function() { openClassGroupEditModal(null, parseInt(majorId), majorName); };
                    if (filterHint) filterHint.textContent = '共 ' + items.length + ' 个班级';
                    tb.innerHTML = '<tr><th>班级名称</th><th>年级</th><th>操作</th></tr>' + items.map(function(cg) {
                        return '<tr><td>' + cg.name + '</td><td>' + (cg.grade||'-') +
                            '</td><td><button class="btn btn-outline-primary btn-sm py-0 me-1 edit-cg-btn" data-cgid="' + cg.id + '">编辑</button>' +
                            '<button class="btn btn-outline-danger btn-sm py-0 del-cg-btn" data-cgid="' + cg.id + '" data-cgname="' + cg.name + '">删除</button></td></tr>';
                    }).join('') || '<tr><td colspan="3" class="text-muted">该专业暂无班级</td></tr>';
                    document.querySelectorAll('.edit-cg-btn').forEach(function(b) {
                        b.addEventListener('click', function() {
                            var cgid = parseInt(this.getAttribute('data-cgid'));
                            var cg = resPageData.find(function(x) { return x.id === cgid; });
                            if (cg) openClassGroupEditModal(cg, parseInt(majorId), majorName);
                        });
                    });
                    document.querySelectorAll('.del-cg-btn').forEach(function(b) {
                        b.addEventListener('click', function() {
                            deleteClassGroup(parseInt(this.getAttribute('data-cgid')), this.getAttribute('data-cgname'), parseInt(majorId));
                        });
                    });
              }; renderResPage(); }).catch(function() {
                    tb.innerHTML = '<tr><td colspan="3" class="text-danger">加载失败</td></tr>';
                });
            }

            // 监听筛选变化
            filterSel.onchange = function() {
                var mid = this.value;
                sessionStorage.setItem('classgroupFilterMajor', mid);
                renderClassGroupTable(mid);
            };
            filterGrade.onchange = function() {
                sessionStorage.setItem('classgroupFilterGrade', this.value);
                renderClassGroupTable(filterSel.value);
            };

            // 初始加载
            var initMajorId = filterSel.value;
            renderClassGroupTable(initMajorId);
        } else if(curRes==='course-assignments'){
            addBtn.classList.add('d-none');
            var d = await CourseQSortAPI.admin.getCourseAssignmentsList();
            resPageData = d.results || []; _curResRender = function() { var items = getResPageItems();
            tb.innerHTML = '<tr><th>课程</th><th>专业</th><th>年级</th><th>班级</th><th>操作</th></tr>' + items.map(function(a){
                return '<tr><td>' + (a.course_name||a.course||'-') + '</td><td>' + (a.major_name||a.major||'-') +
                    '</td><td>' + (a.grade||'-') + '</td><td>' + (a.class_name||a.class_identification||'-') +
                    '</td><td><button class="btn btn-outline-danger btn-sm py-0 del-assign-btn" data-aid="' + a.id + '">删除</button></td></tr>';
            }).join('') || '<tr><td colspan="5" class="text-muted">暂无必修分配规则</td></tr>';
            document.querySelectorAll('.del-assign-btn').forEach(function(b){
                b.addEventListener('click', function(){
                    var aid = parseInt(this.getAttribute('data-aid'));
                    if(!confirm('确定要删除此分配规则吗？')) return;
                    CourseQSortAPI.admin.deleteCourseAssignment(aid).then(function(){ loadResTable(); }).catch(function(e){ alert('删除失败: '+(e.message||'网络错误')); });
                });
            });
            }; renderResPage();
        }
    } catch(e) { tb.innerHTML = '<tr><td colspan="5" class="text-danger">加载失败: ' + e.message + '</td></tr>'; }
}
async function loadSlots(){try{var d=await CourseQSortAPI.admin.getProtectedSlots();var slots=d.results||[];var tb=document.getElementById('protected-slots-list');tb.innerHTML=slots.map(function(s){return'<tr><td>'+W[s.day_of_week]+'</td><td>'+P[s.start_period]+' ~ '+P[s.end_period]+'</td><td>'+s.penalty_weight+'</td><td>'+s.description+'</td><td><button class="btn btn-outline-danger btn-sm py-0 del-slot" data-id="'+s.id+'">删除</button></td></tr>';}).join('')||'<tr><td colspan="5" class="text-muted">暂无保护时段</td></tr>';document.querySelectorAll('.del-slot').forEach(function(b){b.addEventListener('click',async function(){var id=parseInt(this.getAttribute('data-id'));await CourseQSortAPI.admin.deleteProtectedSlot(id);loadSlots();});});}catch(e){}}
document.getElementById('protected-add-btn').addEventListener('click',function(){document.getElementById('slot-modal-body').innerHTML='<div class="mb-2"><label class="form-label">星期</label><select class="form-select form-select-sm" id="s-day">'+[1,2,3,4,5].map(function(d){return'<option value="'+d+'">'+W[d]+'</option>';}).join('')+'</select></div><div class="mb-2"><label class="form-label">起始节次</label><select class="form-select form-select-sm" id="s-start">'+[1,2,3,4,5,6,7,8,9,10,11].map(function(p){return'<option value="'+p+'">'+P[p]+'</option>';}).join('')+'</select></div><div class="mb-2"><label class="form-label">结束节次</label><select class="form-select form-select-sm" id="s-end">'+[1,2,3,4,5,6,7,8,9,10,11].map(function(p){return'<option value="'+p+'">'+P[p]+'</option>';}).join('')+'</select></div><div class="mb-2"><label class="form-label">惩罚权重(0~10)</label><input type="range" class="form-range" id="s-weight" min="0" max="10" step="0.5" value="8"><span id="s-weight-val">8.0</span></div><div class="mb-2"><label class="form-label">说明</label><input class="form-control form-control-sm" id="s-desc" placeholder="辅修热门时段"></div>';document.getElementById('s-weight').addEventListener('input',function(){document.getElementById('s-weight-val').textContent=parseFloat(this.value).toFixed(1);});new bootstrap.Modal(document.getElementById('slot-modal')).show();});
document.getElementById('slot-modal-save').addEventListener('click',async function(){var data={day_of_week:parseInt(document.getElementById('s-day').value),start_period:parseInt(document.getElementById('s-start').value),end_period:parseInt(document.getElementById('s-end').value),penalty_weight:parseFloat(document.getElementById('s-weight').value),description:document.getElementById('s-desc').value||''};await CourseQSortAPI.admin.addProtectedSlot(data);bootstrap.Modal.getInstance(document.getElementById('slot-modal')).hide();loadSlots();});
document.getElementById('protected-batch-btn').addEventListener('click',function(){alert('批量更新：将替换所有保护时段（模拟）');});
async function loadPlans(){try{var d=await CourseQSortAPI.admin.getSchedulePlans();var plans=d.results||[];var tb=document.getElementById('schedule-plans-list');var SM={DRAFT:'草稿',PUBLISHED:'已发布',GENERATING:'生成中'};tb.innerHTML=plans.map(function(p){var vb='<a class="btn btn-outline-primary btn-sm py-0 me-1" href="timetable.html?plan='+p.id+'&source=admin" target="_blank">课表</a>';var pb=p.status==='DRAFT'?' <button class="btn btn-outline-success btn-sm py-0 pub-plan" data-id="'+p.id+'">发布</button>':'';var db='<button class="btn btn-outline-danger btn-sm py-0 ms-1 del-plan" data-pid="'+p.id+'" data-pname="'+p.plan_name+'">删除</button>';return'<tr><td>'+p.plan_name+'</td><td>'+p.semester+'</td><td><span class="badge bg-'+(p.status==='PUBLISHED'?'success':'secondary')+'">'+(SM[p.status]||p.status)+'</span></td><td>'+(p.overall_fitness!=null?p.overall_fitness:'-')+'</td><td class="small">'+(p.created_at?p.created_at.replace('T',' ').slice(0,16):'-')+'</td><td>'+vb+pb+db+'</td></tr>';}).join('')||'<tr><td colspan="6" class="text-muted">暂无方案</td></tr>';document.querySelectorAll('.pub-plan').forEach(function(b){b.addEventListener('click',async function(){var id=parseInt(this.getAttribute('data-id'));try{var r=await CourseQSortAPI.admin.publishPlan(id);alert('发布成功！\n已同步 '+ (r.synced_courses||0) +' 门课程\n共 '+ (r.synced_items||0) +' 条排课记录\n学生端和教师端现已可见');loadPlans();}catch(e){alert('发布失败: '+(e.message||'网络错误'));}});});document.querySelectorAll('.del-plan').forEach(function(b){b.addEventListener('click',async function(){var pid=parseInt(this.getAttribute('data-pid'));var pname=this.getAttribute('data-pname');if(!confirm('确定要删除方案「'+pname+'」吗？此操作不可恢复。')) return;try{await CourseQSortAPI.admin.deleteSchedulePlan(pid);loadPlans();}catch(e){alert('删除失败: '+(e.message||'网络错误'));}});});}catch(e){}}
document.getElementById('schedule-generate-btn').addEventListener('click',async function(){
    var statusEl=document.getElementById('schedule-task-status');
    var textEl=document.getElementById('schedule-task-text');
    var timerEl=document.getElementById('schedule-task-timer');
    var barEl=document.getElementById('schedule-progress-bar');
    var detailEl=document.getElementById('schedule-task-detail');
    var startTime=Date.now();
    var pollTimer=null;

    function formatTime(seconds){
        if(seconds<60) return Math.round(seconds)+'秒';
        var m=Math.floor(seconds/60);
        var s=Math.round(seconds%60);
        return m+'分'+s+'秒';
    }

    function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

    // 显示进度面板
    statusEl.className='alert alert-info';statusEl.style.display='block';
    textEl.textContent='⏳ 正在生成排课方案，所需时间较长，请耐心等待...';
    timerEl.textContent='预计 1-3 分钟';
    barEl.style.width='0%';barEl.textContent='0%';
    barEl.className='progress-bar progress-bar-striped progress-bar-animated';
    detailEl.textContent='正在提交任务...';
    document.getElementById('schedule-generate-btn').disabled=true;

    try{
        var ac=await CourseQSortAPI.admin.getAlgorithmConfig().catch(function(){return{};});
        var r=await CourseQSortAPI.admin.generateSchedule({
            plan_name:'新方案-'+new Date().toLocaleString(),
            semester:'2026-spring',major_ids:[],
            algorithm_config:{
                timetable_periods:(getTimetableConfig().periods||[]).length,
                total_weeks:getTimetableConfig().totalWeeks||18,
                session_length:2,
                period_times:getTimetableConfig().periods||[],
                period_groups:ac.period_groups||[],
                allow_cross_period:ac.allow_cross_period||false,
                align_sessions:ac.align_sessions!==undefined?ac.align_sessions:true,
                later_period_weight:ac.later_period_weight!==undefined?ac.later_period_weight:0
            }
        });
        console.log('[schedule] generate result:',r);

        var taskId=r.task_id;
        if(!taskId){
            statusEl.className='alert alert-danger';
            textEl.textContent='生成失败：未获取到任务ID';
            barEl.className='progress-bar bg-danger';barEl.style.width='100%';barEl.textContent='失败';
            detailEl.textContent='';
            document.getElementById('schedule-generate-btn').disabled=false;
            return;
        }

        // 开始轮询
        detailEl.textContent='任务已提交，正在初始化...';
        pollTimer=setInterval(async function(){
            try{
                var task=await CourseQSortAPI.admin.getScheduleTask(taskId);
                var progress=parseFloat(task.progress)||0;
                var pct=Math.round(progress*100);
                barEl.style.width=pct+'%';barEl.textContent=pct+'%';

                // 计算预计剩余时间
                var elapsed=(Date.now()-startTime)/1000;
                if(progress>0.01){
                    var totalEst=elapsed/progress;
                    var remaining=Math.max(0,totalEst-elapsed);
                    timerEl.textContent='预计剩余 '+formatTime(remaining);
                }

                // 显示当前代数
                var gen=task.current_generation||0;
                var fitness=task.best_fitness!=null?task.best_fitness.toFixed(2):'0.00';
                detailEl.textContent='迭代第 '+gen+' 代 | 当前最佳评分: '+fitness;

                if(task.status==='SUCCESS'){
                    stopPolling();
                    statusEl.className='alert alert-success';
                    textEl.textContent='✅ 方案生成完成！生成 '+ (task.total_entries||r.total_entries||0) +' 条排课记录';
                    barEl.className='progress-bar bg-success';barEl.style.width='100%';barEl.textContent='100%';
                    timerEl.textContent='总耗时 '+formatTime((Date.now()-startTime)/1000);
                    detailEl.textContent='最佳评分: '+fitness+' | 共 '+gen+' 代';
                    document.getElementById('schedule-generate-btn').disabled=false;
                    loadPlans();
                }else if(task.status==='FAILED'){
                    stopPolling();
                    statusEl.className='alert alert-danger';
                    textEl.textContent='❌ 生成失败';
                    barEl.className='progress-bar bg-danger';
                    var errMsg=task.error_message||'';
                    detailEl.innerHTML='错误: '+(errMsg||'请查看后端日志');
                    timerEl.textContent='';
                    document.getElementById('schedule-generate-btn').disabled=false;
                    loadPlans();
                }
            }catch(e){
                stopPolling();
                statusEl.className='alert alert-danger';
                textEl.textContent='❌ 状态查询失败: '+(e.message||'网络错误');
                barEl.className='progress-bar bg-danger';
                document.getElementById('schedule-generate-btn').disabled=false;
            }
        },2000);

    }catch(e){
        stopPolling();
        statusEl.className='alert alert-danger';
        textEl.textContent='请求失败: '+(e.message||'网络错误');
        barEl.className='progress-bar bg-danger';barEl.style.width='100%';barEl.textContent='失败';
        detailEl.textContent='';
        console.error(e);
        document.getElementById('schedule-generate-btn').disabled=false;
    }
});
async function loadConflict(){try{var d=await CourseQSortAPI.admin.getConflictResults();var rs=d.results||[];var tb=document.getElementById('conflict-results-list');tb.innerHTML=rs.map(function(r){return'<tr><td>#'+r.id+'</td><td>'+r.semester+'</td><td>'+r.course_count+'</td><td><span class="badge bg-danger">'+r.conflict_pairs_count+' 对</span></td><td>'+r.threshold+'</td><td class="small">'+(r.created_at?r.created_at.replace('T',' ').slice(0,16):'-')+'</td><td><button class="btn btn-outline-danger btn-sm py-0 view-pairs" data-id="'+r.id+'"><i class="bi bi-list-ul"></i> 查看冲突详情</button></td></tr>';}).join('')||'<tr><td colspan="7" class="text-muted text-center py-4"><i class="bi bi-check-circle text-success" style="font-size:1.5rem;"></i><p class="mt-2 mb-0">暂无分析结果，点击上方「运行分析」开始检测课程冲突</p></td></tr>';document.querySelectorAll('.view-pairs').forEach(function(b){b.addEventListener('click',async function(){var id=parseInt(this.getAttribute('data-id'));var area=document.getElementById('conflict-chart-area');area.innerHTML='<div class="text-center py-3"><div class="spinner-border spinner-border-sm text-muted"></div> 加载中...</div>';try{var pd=await CourseQSortAPI.admin.getConflictPairs(id);var pairs=pd.results||[];if(!pairs.length){area.innerHTML='<div class="text-muted text-center py-3">暂无冲突课程对</div>';return;}var DAYS={1:'一',2:'二',3:'三',4:'四',5:'五'};var html='<div class="card"><div class="card-header d-flex justify-content-between align-items-center"><h6 class="mb-0"><i class="bi bi-exclamation-triangle text-danger"></i> 冲突课程详情 — 共 '+pairs.length+' 对</h6><small class="text-muted">按冲突人数降序</small></div>';html+='<div class="table-responsive"><table class="table table-sm table-hover mb-0"><thead><tr><th>#</th><th>课程A</th><th>课程B</th><th>冲突人数</th><th>冲突率</th><th>重叠时段</th></tr></thead><tbody>';pairs.forEach(function(p,i){var slots=p.overlapping_slots||[];var slotText=slots.map(function(s){return'<span class="badge bg-warning text-dark me-1">周'+DAYS[s.day]+' 第'+s.period+'节</span>';}).join('');if(!slotText)slotText='<small class="text-muted">-</small>';html+='<tr><td>'+(i+1)+'</td><td><strong>'+p.course_a.name+'</strong><br><small class="text-muted">'+ (p.course_a.code||'') +'</small></td><td><strong>'+p.course_b.name+'</strong><br><small class="text-muted">'+ (p.course_b.code||'') +'</small></td><td><span class="badge bg-danger">'+p.conflicting_student_count+' 人</span></td><td>'+Math.round(p.conflict_rate*100)+'%</td><td>'+slotText+'</td></tr>';});html+='</tbody></table></div></div>';area.innerHTML=html;}catch(ex){area.innerHTML='<div class="alert alert-danger py-2">加载失败: '+(ex.message||'网络错误')+'</div>';}});});}catch(e){document.getElementById('conflict-results-list').innerHTML='<tr><td colspan="7" class="text-danger">加载失败: '+(e.message||'')+'</td></tr>';}}
document.getElementById('conflict-run-btn').addEventListener('click',async function(){
    var statusEl=document.getElementById('conflict-task-status');
    var textEl=document.getElementById('conflict-task-text');
    var timerEl=document.getElementById('conflict-task-timer');
    var barEl=document.getElementById('conflict-progress-bar');
    var detailEl=document.getElementById('conflict-task-detail');
    var startTime=Date.now();
    var pollTimer=null;

    function formatTime(seconds){
        if(seconds<60) return Math.round(seconds)+'秒';
        return Math.floor(seconds/60)+'分'+Math.round(seconds%60)+'秒';
    }
    function stopPolling(){if(pollTimer){clearInterval(pollTimer);pollTimer=null;}}

    statusEl.className='alert alert-info';statusEl.style.display='block';
    textEl.textContent='⏳ 正在分析课程冲突，请耐心等待...';
    timerEl.textContent='预计 10-30 秒';
    barEl.style.width='0%';barEl.textContent='0%';
    barEl.className='progress-bar progress-bar-striped progress-bar-animated';
    detailEl.textContent='正在提交分析任务...';
    document.getElementById('conflict-run-btn').disabled=true;
    document.getElementById('conflict-chart-area').innerHTML='';

    try{
        var r=await CourseQSortAPI.admin.runConflictAnalysis({semester:'2026-spring',course_ids:[],threshold:parseInt(document.getElementById('conflict-threshold').value)||10});
        var taskId=r.task_id;
        if(!taskId){
            statusEl.className='alert alert-danger';textEl.textContent='分析失败：未获取到任务ID';
            barEl.className='progress-bar bg-danger';barEl.style.width='100%';barEl.textContent='失败';
            detailEl.textContent='';document.getElementById('conflict-run-btn').disabled=false;
            return;
        }

        detailEl.textContent='任务已提交，正在分析课程时段重叠...';
        pollTimer=setInterval(async function(){
            try{
                var task=await CourseQSortAPI.admin.getConflictTask(taskId);
                var progress=parseFloat(task.progress)||0;
                var pct=Math.round(progress*100);
                barEl.style.width=pct+'%';barEl.textContent=pct+'%';

                var elapsed=(Date.now()-startTime)/1000;
                if(progress>0.01){
                    var remaining=Math.max(0,(elapsed/progress)-elapsed);
                    timerEl.textContent='预计剩余 '+formatTime(remaining);
                }
                detailEl.textContent='已分析 '+ (task.analyzed_pairs||0) +' / '+ (task.total_pairs||0) +' 对课程组合';

                if(task.status==='SUCCESS'){
                    stopPolling();
                    statusEl.className='alert alert-success';
                    textEl.textContent='✅ 分析完成！共发现 '+ (task.conflict_pairs_found||0) +' 对冲突课程';
                    barEl.className='progress-bar bg-success';barEl.style.width='100%';barEl.textContent='100%';
                    timerEl.textContent='总耗时 '+formatTime((Date.now()-startTime)/1000);
                    detailEl.textContent='已分析全部 '+ (task.total_pairs||0) +' 对课程组合';
                    document.getElementById('conflict-run-btn').disabled=false;
                    loadConflict();
                }else if(task.status==='FAILED'){
                    stopPolling();
                    statusEl.className='alert alert-danger';
                    textEl.textContent='❌ 分析失败';
                    barEl.className='progress-bar bg-danger';
                    detailEl.innerHTML='错误: '+(task.error_message||'请查看后端日志');
                    timerEl.textContent='';
                    document.getElementById('conflict-run-btn').disabled=false;
                    loadConflict();
                }
            }catch(e){
                stopPolling();
                statusEl.className='alert alert-danger';
                textEl.textContent='❌ 状态查询失败: '+(e.message||'网络错误');
                barEl.className='progress-bar bg-danger';
                document.getElementById('conflict-run-btn').disabled=false;
            }
        },2000);
    }catch(e){
        stopPolling();
        statusEl.className='alert alert-danger';
        textEl.textContent='请求失败: '+(e.message||'网络错误');
        barEl.className='progress-bar bg-danger';barEl.style.width='100%';barEl.textContent='失败';
        detailEl.textContent='';console.error(e);
        document.getElementById('conflict-run-btn').disabled=false;
    }
});
function _makeSlider(key,label,desc,min,max,step,val,unit,showPercent){
    unit=unit||'';showPercent=showPercent||false;
    var pct=((val-min)/(max-min)*100).toFixed(0);
    var display=showPercent?(val*100).toFixed(0)+'%':parseFloat(val).toFixed(step<1?2:0)+unit;
    return'<div class="col-12 mb-3"><div class="d-flex justify-content-between align-items-center mb-1">'+
        '<span class="fw-bold small">'+label+'</span>'+
        '<span class="badge bg-primary rounded-pill" id="ap-'+key+'">'+display+'</span></div>'+
        '<input type="range" class="form-range" id="a-'+key+'" min="'+min+'" max="'+max+'" step="'+step+'" value="'+val+'">'+
        '<div class="d-flex justify-content-between"><small class="text-muted">'+desc+'</small>'+
        '<small class="text-muted" id="ah-'+key+'">'+pct+'%</small></div></div>';
}
// ---- 课表框架默认模板 ----
var TIMETABLE_TEMPLATES = {
    '8': {periodsPerDay:8, totalWeeks:18, periods:[
        {name:'第1节',start:'08:00',end:'08:45'},{name:'第2节',start:'08:55',end:'09:40'},
        {name:'第3节',start:'10:00',end:'10:45'},{name:'第4节',start:'10:55',end:'11:40'},
        {name:'第5节',start:'14:00',end:'14:45'},{name:'第6节',start:'14:55',end:'15:40'},
        {name:'第7节',start:'16:00',end:'16:45'},{name:'第8节',start:'16:55',end:'17:40'}
    ]},
    '10': {periodsPerDay:10, totalWeeks:18, periods:[
        {name:'第1节',start:'08:00',end:'08:45'},{name:'第2节',start:'08:55',end:'09:40'},
        {name:'第3节',start:'10:00',end:'10:45'},{name:'第4节',start:'10:55',end:'11:40'},
        {name:'第5节',start:'12:00',end:'12:45'},{name:'第6节',start:'14:00',end:'14:45'},
        {name:'第7节',start:'14:55',end:'15:40'},{name:'第8节',start:'16:00',end:'16:45'},
        {name:'第9节',start:'16:55',end:'17:40'},{name:'第10节',start:'19:00',end:'19:45'}
    ]},
    '11': {periodsPerDay:11, totalWeeks:18, periods:[
        {name:'第1节',start:'08:00',end:'08:45'},{name:'第2节',start:'08:55',end:'09:40'},
        {name:'第3节',start:'10:00',end:'10:45'},{name:'第4节',start:'10:55',end:'11:40'},
        {name:'第5节',start:'12:00',end:'13:30'},{name:'第6节',start:'14:00',end:'14:45'},
        {name:'第7节',start:'14:55',end:'15:40'},{name:'第8节',start:'16:00',end:'16:45'},
        {name:'第9节',start:'16:55',end:'17:40'},{name:'第10节',start:'19:00',end:'19:45'},
        {name:'第11节',start:'19:55',end:'20:40'}
    ]}
};
function getTimetableConfig(){
    var raw = localStorage.getItem('timetableConfig');
    if(raw){ try{ var tc=JSON.parse(raw); if(!tc.totalWeeks) tc.totalWeeks=18; return tc; }catch(e){} }
    return TIMETABLE_TEMPLATES['8'];
}
function saveTimetableConfig(tc){
    localStorage.setItem('timetableConfig', JSON.stringify(tc));
}
function renderPeriodsTable(tc){
    var h='';
    for(var i=0;i<tc.periods.length;i++){
        var p=tc.periods[i];
        h+='<tr><td class="small text-muted">'+(i+1)+'</td>'+
            '<td><input class="form-control form-control-sm tp-name" value="'+p.name+'" data-idx="'+i+'"></td>'+
            '<td><input type="time" class="form-control form-control-sm tp-start" value="'+p.start+'" data-idx="'+i+'"></td>'+
            '<td><input type="time" class="form-control form-control-sm tp-end" value="'+p.end+'" data-idx="'+i+'"></td></tr>';
    }
    document.getElementById('timetable-periods-body').innerHTML=h;
    _bindPeriodInputs();
}
function _bindPeriodInputs(){
    document.querySelectorAll('.tp-name,.tp-start,.tp-end').forEach(function(el){
        el.addEventListener('change',_savePeriodConfig);
    });
}
function _savePeriodConfig(){
    var tc=getTimetableConfig();
    document.querySelectorAll('.tp-name').forEach(function(el){var i=parseInt(el.getAttribute('data-idx'));if(tc.periods[i])tc.periods[i].name=el.value;});
    document.querySelectorAll('.tp-start').forEach(function(el){var i=parseInt(el.getAttribute('data-idx'));if(tc.periods[i])tc.periods[i].start=el.value;});
    document.querySelectorAll('.tp-end').forEach(function(el){var i=parseInt(el.getAttribute('data-idx'));if(tc.periods[i])tc.periods[i].end=el.value;});
    saveTimetableConfig(tc);
}
function applyTimetableTemplate(num){
    var tmpl=TIMETABLE_TEMPLATES[num]||TIMETABLE_TEMPLATES['8'];
    var tc={periodsPerDay:tmpl.periodsPerDay, totalWeeks:tmpl.totalWeeks||18, periods:tmpl.periods.map(function(p){return {name:p.name,start:p.start,end:p.end};})};
    saveTimetableConfig(tc);
    document.getElementById('timetable-period-count').value=tc.periodsPerDay;
    document.getElementById('timetable-total-weeks').value=tc.totalWeeks;
    renderPeriodsTable(tc);
}
function changePeriodCount(count){
    count=parseInt(count);
    var tc=getTimetableConfig();
    while(tc.periods.length<count){
        var i=tc.periods.length+1;
        tc.periods.push({name:'第'+i+'节',start:'08:00',end:'08:45'});
    }
    while(tc.periods.length>count){tc.periods.pop();}
    tc.periodsPerDay=count;
    saveTimetableConfig(tc);
    renderPeriodsTable(tc);
}

async function loadAlgo(){try{
    var c=await CourseQSortAPI.admin.getAlgorithmConfig();
    var form=document.getElementById('algorithm-config-form');
    var tc=getTimetableConfig();
    var h='';

    // ===== 课表框架 =====
    h+='<h6 class="mb-3"><i class="bi bi-clock"></i> 课表框架 —— 每天几节课？每节多长时间？</h6>';
    h+='<div class="card bg-light mb-4"><div class="card-body">';
    h+='<div class="row g-2 mb-2"><div class="col-md-3"><label class="form-label small">每天节数</label><div class="input-group input-group-sm"><input type="number" class="form-control" id="timetable-period-count" value="'+tc.periodsPerDay+'" min="1" max="15"><button class="btn btn-outline-secondary" id="timetable-apply-count">应用</button></div></div>';
    h+='<div class="col-md-3"><label class="form-label small">学期总周数</label><div class="input-group input-group-sm"><input type="number" class="form-control" id="timetable-total-weeks" value="'+(tc.totalWeeks||18)+'" min="1" max="30"><button class="btn btn-outline-secondary" id="timetable-apply-weeks">应用</button></div></div>';
    h+='<div class="col-md-6 d-flex align-items-end"><button class="btn btn-outline-primary btn-sm w-100" id="timetable-template-8">📋 8节模板</button></div>';
    h+='<div class="col-md-3 d-flex align-items-end"><button class="btn btn-outline-secondary btn-sm w-100" id="timetable-template-10">📋 10节模板</button></div>';
    h+='<div class="col-md-3 d-flex align-items-end"><button class="btn btn-outline-secondary btn-sm w-100" id="timetable-template-11">📋 11节模板</button></div>';
    h+='</div>';
    h+='<div class="table-responsive"><table class="table table-sm table-bordered mb-0"><thead><tr><th style="width:50px">#</th><th>节次名称</th><th>上课时间</th><th>下课时间</th></tr></thead><tbody id="timetable-periods-body"></tbody></table></div>';
    h+='<small class="text-muted mt-1">修改时间后自动保存，课表页面会自动应用</small>';
    h+='</div></div>';

    // ===== 时间段分组 =====
    var pg = c.period_groups || [];
    var allowCross = c.allow_cross_period !== undefined ? c.allow_cross_period : false;
    if (pg.length === 0 && tc.periodsPerDay) {
        // 默认按每 4 节一组自动生成
        var groupCount = Math.max(2, Math.ceil(tc.periodsPerDay / 4));
        var perGroup = Math.floor(tc.periodsPerDay / groupCount);
        var p = 1;
        for (var g = 0; g < groupCount; g++) {
            var end = (g === groupCount - 1) ? tc.periodsPerDay : p + perGroup - 1;
            pg.push([p, end]);
            p = end + 1;
        }
    }
    h+='<h6 class="mb-3"><i class="bi bi-layout-split"></i> 时间段分组 —— 定义上午/下午/晚上等时间段</h6>';
    h+='<div class="card bg-light mb-4"><div class="card-body">';
    h+='<div class="row g-2 mb-2" id="period-groups-container">';
    pg.forEach(function (g, idx) {
        h+='<div class="col-auto period-group-item"><div class="input-group input-group-sm"><span class="input-group-text">段'+(idx+1)+'</span><span class="input-group-text">第</span><input type="number" class="form-control pg-start" value="'+g[0]+'" min="1" max="'+tc.periodsPerDay+'" style="width:55px;" data-idx="'+idx+'"><span class="input-group-text">-</span><input type="number" class="form-control pg-end" value="'+g[1]+'" min="1" max="'+tc.periodsPerDay+'" style="width:55px;" data-idx="'+idx+'"><span class="input-group-text">节</span></div></div>';
    });
    h+='</div>';
    h+='<div class="mb-2"><button class="btn btn-outline-secondary btn-sm me-1" id="pg-add-btn">+ 添加段</button><button class="btn btn-outline-secondary btn-sm" id="pg-remove-btn">- 移除段</button></div>';
    h+='<div class="form-check form-switch">';
    h+='<input class="form-check-input" type="checkbox" id="allow-cross-period"'+(allowCross?' checked':'')+'>';
    h+='<label class="form-check-label small" for="allow-cross-period">允许排课时跨时间段（关闭后课程不会跨上午/下午等）</label>';
    h+='</div>';
    h+='</div></div>';

    // ===== 排课目标 =====
    h+='<h6 class="mb-3"><i class="bi bi-bullseye"></i> 排课目标 —— 你希望什么样的课表？</h6>';
    h+='<div class="card bg-light mb-4"><div class="card-body">';

    var v1=c.variance_weight!=null?c.variance_weight:0.6;
    h+=_makeSlider('variance_weight','每天课时均匀度',
        '数值越高，课程越均匀分布在一周五天，避免某天课特别多',
        0,1,0.05,v1,'',true);

    var v2=c.conflict_penalty_weight!=null?c.conflict_penalty_weight:0.4;
    h+=_makeSlider('conflict_penalty_weight','避开辅修热门时段',
        '数值越高，越倾向于不占用辅修学生常选的黄金时段',
        0,1,0.05,v2,'',true);

    var v3=c.protected_slot_penalty!=null?c.protected_slot_penalty:8.0;
    h+=_makeSlider('protected_slot_penalty','辅修时段保护力度',
        '占用辅修时段时的"惩罚分"，越高排课时越不敢碰辅修时段',
        0,10,0.5,v3,' 分');

    var vLater=c.later_period_weight!=null?c.later_period_weight:0;
    h+=_makeSlider('later_period_weight','排课后置力度',
        '大于0时优先把课往后排，2连排优先第3>1节，4连排优先下午>上午。0=关闭',
        0,0.4,0.05,vLater,'',true);

    h+='</div></div>';

    // ===== 算法性能 =====
    h+='<h6 class="mb-3"><i class="bi bi-cpu"></i> 运行配置 —— 花多少时间算出结果？</h6>';
    h+='<div class="card bg-light mb-4"><div class="card-body">';

    var v4=c.population_size!=null?c.population_size:200;
    h+=_makeSlider('population_size','方案尝试数量',
        '每轮同时尝试多少种不同的排法（越多越可能找到好方案，但计算更慢）',
        50,500,10,v4,' 种');

    var v5=c.max_generations!=null?c.max_generations:500;
    h+=_makeSlider('max_generations','优化迭代轮数',
        '算法自我改进多少轮才停止（越多结果可能越好，但时间更长）',
        100,2000,50,v5,' 轮');

    var v6=c.timeout_seconds!=null?c.timeout_seconds:300;
    h+=_makeSlider('timeout_seconds','最长运行时间',
        '到达此时间后不论结果如何都停止，取当前最好的方案',
        60,600,10,v6,' 秒');

    h+='</div></div>';

    // ===== 高级 =====
    h+='<h6 class="mb-3"><i class="bi bi-gear"></i> 高级选项 —— 一般不需要调整</h6>';
    h+='<div class="card bg-light mb-4"><div class="card-body">';

    var v7=c.mutation_rate!=null?c.mutation_rate:0.05;
    h+=_makeSlider('mutation_rate','随机探索力度',
        '随机打乱课程安排的几率（高=尝试更多新奇组合，低=趋于保守）',
        0,0.2,0.01,v7,'',true);

    var v8=c.crossover_rate!=null?c.crossover_rate:0.85;
    h+=_makeSlider('crossover_rate','方案融合程度',
        '两种不错方案之间互相借鉴排法的比例（高=好的经验传播更快）',
        0.5,1,0.05,v8,'',true);

    var v9=c.align_sessions !== undefined ? c.align_sessions : true;
    h+='<div class="form-check form-switch mt-3">';
    h+='<input class="form-check-input" type="checkbox" id="align-sessions"'+(v9?' checked':'')+'>';
    h+='<label class="form-check-label small" for="align-sessions">连排节次对齐（2节课从奇数节开始，4节课从时间段第一节开始）</label>';
    h+='</div>';

    h+='</div></div>';

    form.innerHTML=h;

    // 绑定 slider 事件
    function _updateSliderFill(el){
        var min=parseFloat(el.min),max=parseFloat(el.max),val=parseFloat(el.value);
        var pct=((val-min)/(max-min)*100).toFixed(1);
        el.style.setProperty('--fill',pct+'%');
    }
    ['variance_weight','conflict_penalty_weight','protected_slot_penalty','later_period_weight','population_size','max_generations','timeout_seconds','mutation_rate','crossover_rate'].forEach(function(k){
        var el=document.getElementById('a-'+k);if(!el)return;
        _updateSliderFill(el);
        el.addEventListener('input',function(){
            _updateSliderFill(this);
            var val=parseFloat(this.value);
            var label=document.getElementById('ap-'+k);
            var hint=document.getElementById('ah-'+k);
            var step=parseFloat(this.step);
            var isPct=['variance_weight','conflict_penalty_weight','later_period_weight','mutation_rate','crossover_rate'].indexOf(k)!==-1;
            if(isPct){
                label.textContent=(val*100).toFixed(0)+'%';
                if(hint) hint.textContent=((val-parseFloat(this.min))/(parseFloat(this.max)-parseFloat(this.min))*100).toFixed(0)+'%';
            } else {
                var unit='';
                if(k==='population_size') unit=' 种';
                else if(k==='max_generations') unit=' 轮';
                else if(k==='timeout_seconds') unit=' 秒';
                else if(k==='protected_slot_penalty') unit=' 分';
                label.textContent=parseFloat(val).toFixed(step<1?2:0)+unit;
                if(hint) hint.textContent=((val-parseFloat(this.min))/(parseFloat(this.max)-parseFloat(this.min))*100).toFixed(0)+'%';
            }
            // 联动：variance + conflict ≈ 1
            if(k==='variance_weight'){
                var ce=document.getElementById('a-conflict_penalty_weight');
                if(ce){ce.value=(1-val).toFixed(2);_updateSliderFill(ce);document.getElementById('ap-conflict_penalty_weight').textContent=((1-val)*100).toFixed(0)+'%';}
            }
            if(k==='conflict_penalty_weight'){
                var ve=document.getElementById('a-variance_weight');
                if(ve){ve.value=(1-val).toFixed(2);_updateSliderFill(ve);document.getElementById('ap-variance_weight').textContent=((1-val)*100).toFixed(0)+'%';}
            }
        });
    });

    // 渲染课表框架表格
    renderPeriodsTable(tc);

    // 课表框架事件绑定
    document.getElementById('timetable-apply-count').addEventListener('click',function(){changePeriodCount(parseInt(document.getElementById('timetable-period-count').value));});
    document.getElementById('timetable-apply-weeks').addEventListener('click',function(){var tc=getTimetableConfig();tc.totalWeeks=parseInt(document.getElementById('timetable-total-weeks').value)||18;saveTimetableConfig(tc);alert('周数已更新为 '+tc.totalWeeks+' 周，重新生成排课方案后生效');});
    document.getElementById('timetable-template-8').addEventListener('click',function(){applyTimetableTemplate(8);});
    document.getElementById('timetable-template-10').addEventListener('click',function(){applyTimetableTemplate(10);});
    document.getElementById('timetable-template-11').addEventListener('click',function(){applyTimetableTemplate(11);});

    // 时间段分组事件
    var pgContainer = document.getElementById('period-groups-container');
    document.getElementById('pg-add-btn').addEventListener('click',function(){
        var tc = getTimetableConfig();
        var items = pgContainer.querySelectorAll('.period-group-item');
        var lastEnd = 0;
        items.forEach(function(item){ var e = parseInt(item.querySelector('.pg-end').value); if(e>lastEnd)lastEnd=e; });
        var newStart = lastEnd + 1;
        var newEnd = Math.min(newStart + 3, tc.periodsPerDay);
        if (newStart > tc.periodsPerDay) { alert('已达最大节数'); return; }
        var idx = items.length;
        var div = document.createElement('div');
        div.className = 'col-auto period-group-item';
        div.innerHTML = '<div class="input-group input-group-sm"><span class="input-group-text">段'+(idx+1)+'</span><span class="input-group-text">第</span><input type="number" class="form-control pg-start" value="'+newStart+'" min="1" max="'+tc.periodsPerDay+'" style="width:55px;" data-idx="'+idx+'"><span class="input-group-text">-</span><input type="number" class="form-control pg-end" value="'+newEnd+'" min="1" max="'+tc.periodsPerDay+'" style="width:55px;" data-idx="'+idx+'"><span class="input-group-text">节</span></div>';
        pgContainer.appendChild(div);
    });
    document.getElementById('pg-remove-btn').addEventListener('click',function(){
        var items = pgContainer.querySelectorAll('.period-group-item');
        if (items.length <= 1) { alert('至少需要1个时间段'); return; }
        items[items.length - 1].remove();
        // 更新最后一个 time range 的 end 为总节数
        var remaining = pgContainer.querySelectorAll('.period-group-item');
        var tc = getTimetableConfig();
        var lastItem = remaining[remaining.length - 1];
        lastItem.querySelector('.pg-end').value = tc.periodsPerDay;
    });

}catch(e){}}
document.getElementById('algorithm-save-btn').addEventListener('click',async function(){var cfg={};['variance_weight','conflict_penalty_weight','protected_slot_penalty','later_period_weight','population_size','max_generations','mutation_rate','crossover_rate','timeout_seconds'].forEach(function(k){var el=document.getElementById('a-'+k);if(el)cfg[k]=parseFloat(el.value);});var pgs=[];document.querySelectorAll('.period-group-item').forEach(function(item){var s=parseInt(item.querySelector('.pg-start').value);var e=parseInt(item.querySelector('.pg-end').value);if(s&&e)pgs.push([s,e]);});cfg.period_groups=pgs;cfg.allow_cross_period=document.getElementById('allow-cross-period').checked;var alignEl=document.getElementById('align-sessions');cfg.align_sessions=alignEl?alignEl.checked:true;try{await CourseQSortAPI.admin.updateAlgorithmConfig(cfg);document.getElementById('algorithm-save-status').textContent='配置已保存';document.getElementById('algorithm-save-status').className='mt-2 small text-success';}catch(e){document.getElementById('algorithm-save-status').textContent='保存失败';document.getElementById('algorithm-save-status').className='mt-2 small text-danger';}});
switchSec('dashboard');
