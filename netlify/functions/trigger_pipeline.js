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
    
    // Create or update a file to trigger push event
    const response = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/contents/.last-manual-update`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${GITEE_TOKEN}`
        },
        body: JSON.stringify({
          content: btoa(`Last manual update: ${timestamp}`),
          message: 'Manual price update triggered',
          branch: 'main'
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'Failed to create file', details: errorText })
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
