// 思源笔记挂件API封装
// 参考DayCounter挂件的实现方式

/**
 * 验证挂件ID格式
 * @param {string} widgetId 挂件ID
 * @returns {boolean} 是否为有效的挂件ID
 */
function isValidWidgetId(widgetId) {
    if (!widgetId || typeof widgetId !== 'string') return false;
    if (widgetId.length < 10 || widgetId.length > 50) return false;
    return true;
}

/**
 * 获取当前挂件ID
 * @returns {string|null} 挂件ID或null
 */
export function getCurrentWidgetId() {
    try {
        // 方法1: 从iframe的父元素获取data-node-id（最可靠的方法）
        if (window.frameElement?.parentElement?.parentElement?.dataset?.nodeId) {
            const widgetId = window.frameElement.parentElement.parentElement.dataset.nodeId;
            if (isValidWidgetId(widgetId)) {
                console.log('Got widget ID from iframe parent:', widgetId);
                return widgetId;
            }
        }
        
        // 方法2: 从URL参数获取
        const urlParams = new URLSearchParams(window.location.search);
        const blockIdFromUrl = urlParams.get('id') || urlParams.get('blockId');
        if (isValidWidgetId(blockIdFromUrl)) {
            console.log('Got widget ID from URL params:', blockIdFromUrl);
            return blockIdFromUrl;
        }
        
        // 方法3: 从父窗口获取
        try {
            if (window.parent && window.parent !== window) {
                const parentUrl = window.parent.location.href;
                const parentUrlParams = new URLSearchParams(parentUrl.split('?')[1] || '');
                const parentBlockId = parentUrlParams.get('id') || parentUrlParams.get('blockId');
                if (isValidWidgetId(parentBlockId)) {
                    console.log('Got widget ID from parent URL:', parentBlockId);
                    return parentBlockId;
                }
            }
        } catch (error) {
            console.log('Cannot access parent window:', error.message);
        }
        
        console.warn('getCurrentWidgetId: No valid widget ID found');
        return null;
    } catch (err) {
        console.warn('getCurrentWidgetId failed:', err);
        return null;
    }
}

/**
 * 向思源API发送请求
 * @param {Object} data 请求数据
 * @param {string} url 请求URL
 * @returns {Promise<Object>} 响应结果
 */
export async function postRequest(data, url) {
    if (!data || !url) {
        throw new Error('postRequest: data and url are required');
    }

    try {
        const response = await fetch(url, {
            body: JSON.stringify(data),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const result = await response.json();
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid response format');
        }
        
        return result;
    } catch (error) {
        console.error('postRequest failed:', error);
        throw error;
    }
}

/**
 * 检查API响应状态
 * @param {Object} response API响应
 * @returns {number} 0表示成功，-1表示失败
 */
export async function checkResponse(response) {
    if (!response || typeof response !== 'object') {
        return -1;
    }
    
    if (response.code === 0) {
        return 0;
    } else {
        return -1;
    }
}

/**
 * 添加块属性（API）
 * @param {Object} attrs 属性对象
 * @param {string} blockid 挂件ID
 * @returns {Promise<number>} 0表示成功，-1表示失败
 */
export async function addblockAttrAPI(attrs, blockid) {
    if (!attrs || typeof attrs !== 'object') {
        console.error('addblockAttrAPI: attrs must be an object');
        return -1;
    }
    
    if (!isValidWidgetId(blockid)) {
        console.error('addblockAttrAPI: invalid blockid');
        return -1;
    }

    try {
        const url = '/api/attr/setBlockAttrs';
        const attr = {
            id: blockid,
            attrs: attrs,
        };
        
        console.log('Setting block attributes:', attr);
        const result = await postRequest(attr, url);
        return await checkResponse(result);
    } catch (error) {
        console.error('addblockAttrAPI failed:', error);
        return -1;
    }
}

/**
 * 获取挂件块参数（API）
 * @param {string} blockid 挂件ID
 * @returns {Promise<Object>} 包含data字段的响应对象
 */
export async function getblockAttrAPI(blockid) {
    if (!isValidWidgetId(blockid)) {
        throw new Error('getblockAttrAPI: invalid blockid');
    }

    try {
        const url = '/api/attr/getBlockAttrs';
        const response = await postRequest({ id: blockid }, url);
        
        if (response.code !== 0) {
            throw new Error(`获取挂件块参数失败: ${response.msg || '未知错误'}`);
        }
        
        return response;
    } catch (error) {
        console.error('getblockAttrAPI failed:', error);
        throw error;
    }
}

/**
 * 获取块属性（带重试机制）
 * @param {string} widgetId 挂件ID
 * @param {number} maxRetries 最大重试次数
 * @param {number} interval 重试间隔（毫秒）
 * @returns {Promise<Object>} 响应结果
 */
export async function getBlockAttributesWithRetry(widgetId, maxRetries = 5, interval = 500) {
    if (!isValidWidgetId(widgetId)) {
        throw new Error('getBlockAttributesWithRetry: invalid widgetId');
    }

    if (maxRetries < 0 || interval < 0) {
        throw new Error('getBlockAttributesWithRetry: invalid parameters');
    }

    try {
        // 尝试获取块属性
        let response = await getblockAttrAPI(widgetId);

        // 如果获取到的数据不是空对象，直接返回结果
        if (response.data && Object.keys(response.data).length > 0) {
            return response;
        }

        // 如果重试次数用完仍然没有获取到数据，抛出错误
        if (maxRetries <= 0) {
            throw new Error('无法获取块属性，超出最大重试次数');
        }

        // 等待一段时间后再次尝试
        return new Promise((resolve, reject) => {
            setTimeout(async () => {
                try {
                    // 递归调用，减少重试次数
                    const result = await getBlockAttributesWithRetry(
                        widgetId,
                        maxRetries - 1,
                        interval
                    );
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, interval);
        });
    } catch (error) {
        console.error('getBlockAttributesWithRetry failed:', error);
        throw error;
    }
}

/**
 * 批量设置块属性
 * @param {Object} attrs 属性对象
 * @param {string} blockid 挂件ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function setMultipleBlockAttrs(attrs, blockid) {
    if (!attrs || typeof attrs !== 'object') {
        console.error('setMultipleBlockAttrs: attrs must be an object');
        return false;
    }
    
    if (!isValidWidgetId(blockid)) {
        console.error('setMultipleBlockAttrs: invalid blockid');
        return false;
    }

    try {
        const result = await addblockAttrAPI(attrs, blockid);
        return result === 0;
    } catch (error) {
        console.error('setMultipleBlockAttrs failed:', error);
        return false;
    }
}

/**
 * 删除块属性
 * @param {string} attrName 属性名
 * @param {string} blockid 挂件ID
 * @returns {Promise<boolean>} 是否成功
 */
export async function removeBlockAttr(attrName, blockid) {
    if (!attrName || typeof attrName !== 'string') {
        console.error('removeBlockAttr: attrName must be a string');
        return false;
    }
    
    if (!isValidWidgetId(blockid)) {
        console.error('removeBlockAttr: invalid blockid');
        return false;
    }

    try {
        const url = '/api/attr/setBlockAttrs';
        const attr = {
            id: blockid,
            attrs: { [attrName]: null }, // 设置为null来删除属性
        };
        
        const result = await postRequest(attr, url);
        return await checkResponse(result) === 0;
    } catch (error) {
        console.error('removeBlockAttr failed:', error);
        return false;
    }
}
