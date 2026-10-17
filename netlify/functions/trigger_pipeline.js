const GITEE_TOKEN = process.env.GITEE_TOKEN;
const GITEE_OWNER = 'qi-zubin';
const GITEE_REPO = 'etf-strategy';

exports.handler = async function(event, context) {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  if (!GITEE_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Gitee token not configured' })
    };
  }

  try {
    const timestamp = new Date().toISOString();
    const content = btoa(`Last manual update: ${timestamp}`);
    const filePath = '.last-manual-update';

    // Try to get existing file first
    const getResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/${filePath}`,
      {
        headers: { 'Authorization': `token ${GITEE_TOKEN}` }
      }
    );

    let response;
    if (getResp.ok) {
      // File exists, update it with PUT
      const existing = await getResp.json();
      response = await fetch(
        `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/${filePath}`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${GITEE_TOKEN}`
          },
          body: JSON.stringify({
            content: content,
            message: 'Manual price update triggered',
            sha: existing.sha,
            branch: 'main'
          })
        }
      );
    } else {
      // File doesn't exist, create it with POST
      response = await fetch(
        `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/${filePath}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `token ${GITEE_TOKEN}`
          },
          body: JSON.stringify({
            content: content,
            message: 'Manual price update triggered',
            branch: 'main'
          })
        }
      );
    }

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to update file', details: errorText })
      };
    }

    const data = await response.json();
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: '手动更新已触发',
        commitSha: data.commit?.sha || 'unknown'
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
