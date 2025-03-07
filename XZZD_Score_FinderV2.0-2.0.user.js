// ==UserScript==
// @name         XZZD_Score_FinderV2.0
// @namespace    http://tampermonkey.net/
// @version      2.0
// @description  显示课程作业成绩的面板，支持最小化、拖动
// @author       Soleil&WuBixing
// @match        *://courses.zju.edu.cn/course/*/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 从 URL 中提取课程 ID
    const courseUrlMatch = window.location.pathname.match(/\/course\/(\d+)\//);
    if (!courseUrlMatch) {
        console.error('无法从 URL 中提取课程 ID。');
        return;
    }
    const courseId = courseUrlMatch[1];

    // 创建面板容器
    const panel = document.createElement('div');
    panel.id = 'score-panel';
    panel.style.position = 'fixed';
    panel.style.bottom = '20px';
    panel.style.right = '20px';
    panel.style.width = '350px';
    panel.style.backgroundColor = '#ffffff';
    panel.style.border = '2px solid #ccc';
    panel.style.borderRadius = '10px';
    panel.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
    panel.style.zIndex = '1000';
    panel.style.fontFamily = 'Arial, sans-serif';

    // 创建标题栏（包含标题和最小化按钮），同时作为拖动区域
    const header = document.createElement('div');
    header.id = 'score-header';
    header.style.backgroundColor = '#87CEEB';
    header.style.color = '#fff';
    header.style.padding = '8px';
    header.style.cursor = 'move';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderRadius = '6px';

    const headerTitle = document.createElement('span');
    headerTitle.innerText = 'XZZD_Score_Finder';
    headerTitle.style.fontWeight = 'bold';

    // 最小化/恢复按钮
    const toggleButton = document.createElement('button');
    toggleButton.innerText = '隐藏';
    toggleButton.style.backgroundColor = '#AED6F1';
    toggleButton.style.border = 'none';
    toggleButton.style.color = '#fff';
    toggleButton.style.padding = '4px 8px';
    toggleButton.style.borderRadius = '3px';
    toggleButton.style.cursor = 'pointer';

    header.appendChild(headerTitle);
    header.appendChild(toggleButton);
    panel.appendChild(header);

    // 创建内容容器，用于显示分数信息
    const contentContainer = document.createElement('div');
    contentContainer.id = 'score-content';
    contentContainer.style.maxHeight = '300px';
    contentContainer.style.overflowY = 'auto';
    contentContainer.style.padding = '10px';
    panel.appendChild(contentContainer);

    document.body.appendChild(panel);

    // 实现面板拖动功能
    (function makeDraggable(el, handle) {
        let posX = 0, posY = 0, mouseX = 0, mouseY = 0;
        handle.addEventListener('mousedown', dragMouseDown);
        function dragMouseDown(e) {
            e.preventDefault();
            mouseX = e.clientX;
            mouseY = e.clientY;
            document.addEventListener('mousemove', elementDrag);
            document.addEventListener('mouseup', closeDragElement);
        }
        function elementDrag(e) {
            e.preventDefault();
            posX = mouseX - e.clientX;
            posY = mouseY - e.clientY;
            mouseX = e.clientX;
            mouseY = e.clientY;
            el.style.top = (el.offsetTop - posY) + "px";
            el.style.left = (el.offsetLeft - posX) + "px";
            el.style.bottom = 'auto';
            el.style.right = 'auto';
        }
        function closeDragElement() {
            document.removeEventListener('mousemove', elementDrag);
            document.removeEventListener('mouseup', closeDragElement);
        }
    })(panel, header);

    // 最小化/恢复功能
    toggleButton.addEventListener('click', () => {
        if (contentContainer.style.display === 'none') {
            contentContainer.style.display = 'block';
            toggleButton.innerText = '隐藏';
        } else {
            contentContainer.style.display = 'none';
            toggleButton.innerText = '显示';
        }
    });

    let previousData = null;

    // 定时或手动获取数据
    function fetchData() {
        const apiUrl = `https://courses.zju.edu.cn/api/course/${courseId}/activity-reads-for-user`;
        fetch(apiUrl)
            .then(response => response.json())
            .then(data => {
                console.log('主 API 数据：', data);
                const data_api = data;
                // 并行请求作业和考试数据
                const apiUrl1 = `https://courses.zju.edu.cn/api/course/${courseId}/homework-scores?fields=id,title`;
                const apiUrl2 = `https://courses.zju.edu.cn/api/courses/${courseId}/exams`;
                return Promise.all([fetch(apiUrl1), fetch(apiUrl2), data_api]);
            })
            .then(async ([response1, response2, data_api]) => {
                const data_first = await response1.json();
                const data_second = await response2.json();
                console.log('作业数据：', data_first);
                console.log('考试数据：', data_second);

                if (!data_first || !data_first.homework_activities) {
                    console.error('作业活动数据缺失。');
                    return;
                }
                if (!data_second || !data_second.exams) {
                    console.error('考试数据缺失。');
                    return;
                }
                const data_final = merge(data_second.exams, data_first.homework_activities, data_api.activity_reads);
                // 对比新旧数据，如有变化则更新显示
                if (JSON.stringify(data_final) !== JSON.stringify(previousData)) {
                    previousData = data_final;
                    displayScores(data_final);
                }
            })
            .catch(error => console.error('数据获取错误：', error));
    }

    // 合并作业和考试数据到活动数据中
    function merge(examsActivities, homeworkActivities, activityReads) {
        const homeworkMap = new Map();
        const examsMap = new Map();
        homeworkActivities.forEach(activity => {
            homeworkMap.set(activity.id, activity.title);
        });
        examsActivities.forEach(exam => {
            examsMap.set(exam.id, exam.title);
        });
        const updatedActivityReads = activityReads.map(activityRead => {
            let title = '未知名称';
            if (homeworkMap.has(activityRead.activity_id)) {
                title = homeworkMap.get(activityRead.activity_id);
            } else if (examsMap.has(activityRead.activity_id)) {
                title = examsMap.get(activityRead.activity_id);
            }
            return {
                ...activityRead,
                title
            };
        });
        return updatedActivityReads;
    }

    function displayScores(activityReads) {
        contentContainer.innerHTML = '';
        if (activityReads.length === 0) {
            contentContainer.innerHTML = "<strong>暂无成绩数据</strong>";
            return;
        }
        const list = document.createElement('ul');
        list.style.listStyle = 'none';
        list.style.padding = '0';
        list.style.margin = '0';

// 排序逻辑：
// 1. 有成绩的 (activity.data.score 存在) 排在最前面
// 2. 没有成绩但标题不是 "未知名称" 的排在中间
// 3. 标题为 "未知名称" 的排在最后
        activityReads.sort((a, b) => {
            const aHasScore = a.data && a.data.score != null;
            const bHasScore = b.data && b.data.score != null;
            if (aHasScore && !bHasScore) return -1;
            if (!aHasScore && bHasScore) return 1;
            const aUnknown = (a.title === '未知名称');
            const bUnknown = (b.title === '未知名称');
            if (!aUnknown && bUnknown) return -1;
            if (aUnknown && !bUnknown) return 1;
            return 0;
        });

        let knownHeaderInserted = false;
        let unknownHeaderInserted = false;
        activityReads.forEach(activity => {
            if (activity.title !== '未知名称' && !knownHeaderInserted) {
                const headerItem = document.createElement('li');
                headerItem.innerText = '已知名称的成绩：';
                headerItem.style.fontWeight = 'bold';
                headerItem.style.padding = '5px';
                headerItem.style.backgroundColor = '#f0f0f0';
                headerItem.style.borderBottom = '1px solid #eee';
                headerItem.style.marginTop = '10px';
                list.appendChild(headerItem);
                knownHeaderInserted = true;
            }
            if (activity.title === '未知名称' && !unknownHeaderInserted) {
                const headerItem = document.createElement('li');
                headerItem.innerText = '未知名称的成绩：';
                headerItem.style.fontWeight = 'bold';
                headerItem.style.padding = '5px';
                headerItem.style.backgroundColor = '#f0f0f0';
                headerItem.style.borderBottom = '1px solid #eee';
                headerItem.style.marginTop = '10px';
                list.appendChild(headerItem);
                unknownHeaderInserted = true;
            }
            const item = document.createElement('li');
            item.style.padding = '5px';
            item.style.borderBottom = '1px solid #eee';
            let text = '';
            if (activity.activity_type === "learning_activity") {
                text = `${activity.title}的成绩: ${activity.data.score || '暂无'}`;
            } else if (activity.activity_type === "exam_activity") {
                text = `${activity.title}的成绩: ${activity.data.score || '暂无'}`;
            } else {
                text = `${activity.title} - 暂无`;
            }
            item.innerText = text;
            list.appendChild(item);
        });
        contentContainer.appendChild(list);
    }

    fetchData();
    // 每5分钟自动刷新数据
    setInterval(fetchData, 5 * 60 * 1000);
})();
