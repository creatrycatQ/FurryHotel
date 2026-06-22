const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', '..', 'FrontEnd');

fs.readdirSync(dir).forEach(file => {
  if (file.endsWith('.html')) {
    const filePath = path.join(dir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    let modified = false;

    // Replace sidebar icon
    const oldSidebar = '<span class="nav-icon">🆔</span><span class="nav-text">客人信息</span>';
    const newSidebar = '<span class="nav-icon">📇</span><span class="nav-text">客人信息</span>';
    if (content.includes(oldSidebar)) {
      content = content.replace(oldSidebar, newSidebar);
      modified = true;
    }

    // Replace header title icon in admin-guest-details.html
    const oldTitle = '<h1 class="page-title">🆔 客人详情</h1>';
    const newTitle = '<h1 class="page-title">📇 客人详情</h1>';
    if (content.includes(oldTitle)) {
      content = content.replace(oldTitle, newTitle);
      modified = true;
    }

    if (modified) {
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Replaced 🆔 with 📇 in ${file}`);
    }
  }
});
