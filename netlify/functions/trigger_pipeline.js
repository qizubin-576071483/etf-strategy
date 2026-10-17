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
    // Get the latest commit SHA
    const branchResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/branches/main`,
      {
        headers: { 'Authorization': `token ${GITEE_TOKEN}` }
      }
    );
    
    if (!branchResp.ok) {
      const errorText = await branchResp.text();
      return {
        statusCode: branchResp.status,
        body: JSON.stringify({ error: 'Failed to get branch info', details: errorText })
      };
    }
    
    const branchData = await branchResp.json();
    const latestSha = branchData.commit.sha;
    
    // Create a blob with timestamp
    const timestamp = new Date().toISOString();
    const blobResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/git/blobs`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${GITEE_TOKEN}`
        },
        body: JSON.stringify({
          content: `Last manual update: ${timestamp}`,
          encoding: 'utf-8'
        })
      }
    );
    
    if (!blobResp.ok) {
      const errorText = await blobResp.text();
      return {
        statusCode: blobResp.status,
        body: JSON.stringify({ error: 'Failed to create blob', details: errorText })
      };
    }
    
    const blobData = await blobResp.json();
    const blobSha = blobData.sha;
    
    // Create a tree with the new blob
    const treeResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/git/trees`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${GITEE_TOKEN}`
        },
        body: JSON.stringify({
          base_tree: latestSha,
          tree: [{
            path: '.last-manual-update',
            mode: '100644',
            type: 'blob',
            sha: blobSha
          }]
        })
      }
    );
    
    if (!treeResp.ok) {
      const errorText = await treeResp.text();
      return {
        statusCode: treeResp.status,
        body: JSON.stringify({ error: 'Failed to create tree', details: errorText })
      };
    }
    
    const treeData = await treeResp.json();
    const treeSha = treeData.sha;
    
    // Create a commit
    const commitResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/git/commits`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${GITEE_TOKEN}`
        },
        body: JSON.stringify({
          message: 'Manual price update triggered',
          tree: treeSha,
          parents: [latestSha]
        })
      }
    );
    
    if (!commitResp.ok) {
      const errorText = await commitResp.text();
      return {
        statusCode: commitResp.status,
        body: JSON.stringify({ error: 'Failed to create commit', details: errorText })
      };
    }
    
    const commitData = await commitResp.json();
    
    // Update the branch to point to the new commit
    const updateResp = await fetch(
      `https://gitee.com/api/v5/repos/${GITEE_OWNER}/${GITEE_REPO}/branches/main`,
      {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `token ${GITEE_TOKEN}`
        },
        body: JSON.stringify({
          commit_sha: commitData.sha
        })
      }
    );
    
    if (!updateResp.ok) {
      const errorText = await updateResp.text();
      return {
        statusCode: updateResp.status,
        body: JSON.stringify({ error: 'Failed to update branch', details: errorText })
      };
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        message: '手动更新已触发',
        commitSha: commitData.sha
      })
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
