const sqlite = require('better-sqlite3');
const argon2 = require('argon2');
const { v4: uuidv4 } = require('uuid');

const PROJECT_ID = 'f41608fd-1efe-4f9d-8342-070761d8794e';
const OWNER_ID = 'a9c662f5-ea95-4847-a18a-dd1066f11e7d';

const FN = [
  'Aarav', 'Priya', 'Rohan', 'Ananya', 'Kiran', 'Divya', 'Arjun', 'Sneha', 'Vivek', 'Kavya',
  'Aditya', 'Pooja', 'Nikhil', 'Shreya', 'Rahul', 'Anjali', 'Suresh', 'Meera', 'Rajesh', 'Lakshmi',
  'Akshay', 'Deepa', 'Praveen', 'Swathi', 'Harish', 'Sindhu', 'Ganesh', 'Rekha', 'Sunil', 'Usha',
  'Ravi', 'Nisha', 'Vijay', 'Vidya', 'Sanjay', 'Leela', 'Prasad', 'Padma', 'Ramesh', 'Gayathri',
  'Mahesh', 'Saritha', 'Prakash', 'Manjula', 'Dinesh', 'Sudha', 'Arun', 'Hema', 'Venkat', 'Bhavya',
  'Kartik', 'Lavanya', 'Naveen', 'Shobha', 'Pavan', 'Revathi', 'Girish', 'Savitha', 'Mohan', 'Uma',
  'Tejas', 'Chaitra', 'Vinay', 'Pushpa', 'Chetan', 'Suma', 'Darshan', 'Geeta', 'Abhishek', 'Nandini',
  'Sridhar', 'Kavitha', 'Varun', 'Shantha', 'Yash', 'Indira', 'Ashok', 'Vani', 'Balaji', 'Shilpa',
  'Karthik', 'Rekha', 'Supriya', 'Manju', 'Deepak', 'Vandana', 'Sachin', 'Archana', 'Ajay', 'Sunita'
];
const LN = [
  'Sharma', 'Patel', 'Kumar', 'Singh', 'Reddy', 'Naidu', 'Rao', 'Nair', 'Iyer', 'Pillai',
  'Gowda', 'Hegde', 'Shetty', 'Kamath', 'Kulkarni', 'Patil', 'Joshi', 'Desai', 'Shah', 'Mehta',
  'Bhat', 'Shenoy', 'Poojary', 'Pai', 'Alva', 'Lobo', 'Fernandez', 'Bangera', 'Bhandari', 'Kini',
  'Menon', 'Varma', 'Krishnan', 'Subramaniam', 'Rajan', 'Venkatesh', 'Murthy', 'Acharya', 'Bose', 'Das',
  'Gupta', 'Mishra', 'Tiwari', 'Pandey', 'Shukla', 'Srivastava', 'Dubey', 'Yadav', 'Chauhan', 'Verma'
];
const PFN = [
  'Suresh', 'Rama', 'Venkatesh', 'Lakshmi', 'Ravi', 'Usha', 'Mahesh', 'Saritha',
  'Ramesh', 'Padma', 'Girish', 'Savitha', 'Prakash', 'Manjula', 'Vijay', 'Leela',
  'Arun', 'Hema', 'Mohan', 'Uma', 'Sridhar', 'Rekha', 'Ashok', 'Vani',
  'Rajesh', 'Gayathri', 'Dinesh', 'Sudha', 'Naresh', 'Jyothi', 'Prasad', 'Anitha',
  'Santosh', 'Sunita', 'Basavaraju', 'Shanthamma', 'Murugan', 'Meenakshi', 'Anand', 'Subha',
  'Krishnamurthy', 'Saraswathi', 'Chandrashekar', 'Bhagyalakshmi', 'Shivarudraiah', 'Vimala',
  'Nagendra', 'Rathnamma', 'Manjunath', 'Sharadha', 'Nagaraj', 'Kamala', 'Papaiah', 'Thayamma',
  'Yellappa', 'Nagaratna', 'Shivappa', 'Mahadevi', 'Kotresh', 'Leelavathi', 'Thimmaiah', 'Lalitha'
];
const RELATIONS = ['Father', 'Father', 'Father', 'Mother', 'Mother', 'Mother', 'Guardian'];
const CITIES = [
  'Bengaluru', 'Mysuru', 'Hubli', 'Belagavi', 'Mangaluru', 'Udupi', 'Shimoga', 'Tumkur',
  'Davangere', 'Hassan', 'Kolar', 'Raichur', 'Bellary', 'Bidar', 'Dharwad', 'Gadag',
  'Chikkamagaluru', 'Kodagu', 'Mandya', 'Bagalkot', 'Vijayapura', 'Chitradurga', 'Haveri', 'Karwar'
];
const DESIG = ['Assistant Professor', 'Associate Professor', 'Professor', 'Senior Professor'];
const QUALS = ['M.Tech', 'PhD', 'ME', 'M.Sc', 'MBA', 'MCA'];

const BRANCH_TEACHERS = { CSE: 80, ECE: 75, ME: 70, CIV: 65, EEE: 70, ISE: 75, AIML: 65 }; // Sum = 500
const BRANCH_STUDENTS = { CSE: 160, ECE: 150, ME: 140, CIV: 130, EEE: 140, ISE: 150, AIML: 130 }; // Sum = 1000

function _name(a, b) { return FN[a % FN.length] + ' ' + LN[b % LN.length]; }
function _phone(n) { return '9' + String(600000000 + (n % 399999999)).slice(0, 9); }
function _dob2(seq) {
  const y = 2002 + (seq % 4);
  const m = String(1 + (seq % 12)).padStart(2, '0');
  const d = String(1 + (seq % 28)).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
function _usn2(br, sem, seq) {
  const brCode = { CSE: 'CS', ECE: 'EC', ME: 'ME', CIV: 'CV', EEE: 'EE', ISE: 'IS', AIML: 'AM' };
  const yr = 24 - Math.floor((sem - 1) / 2);
  return '1BG' + yr + (brCode[br] || br.substring(0, 2).toUpperCase()) + String(seq).padStart(3, '0');
}
function _cgpa(seq) {
  const r = seq % 20;
  if (r === 0) return parseFloat((9.0 + (seq % 10) * 0.05).toFixed(2));
  if (r >= 1 && r <= 5) return parseFloat((8.0 + (seq % 10) * 0.09).toFixed(2));
  if (r >= 6 && r <= 17) return parseFloat((6.5 + (seq % 15) * 0.1).toFixed(2));
  return parseFloat((5.0 + (seq % 15) * 0.1).toFixed(2));
}
function _att(seq) {
  if (seq % 10 === 0) return 62 + (seq % 12);
  if (seq % 9 === 0) return 84 + (seq % 11);
  return 76 + (seq % 7);
}

async function runSeed() {
  console.log('Connecting to database...');
  const db = sqlite('./aegis.db');

  const argon2Options = {
    type: argon2.argon2id,
    memoryCost: 65536,
    timeCost: 3,
    parallelism: 4,
  };

  console.log('Generating password hashes for roles...');
  const hashAdmin = await argon2.hash('admin123', argon2Options);
  const hashTeach = await argon2.hash('teach123', argon2Options);
  const hashStudy = await argon2.hash('study123', argon2Options);
  const hashParent = await argon2.hash('parent123', argon2Options);

  const now = new Date().toISOString();

  // Prepared Statements
  const stmtUser = db.prepare(`
    INSERT OR REPLACE INTO project_users (id, projectId, email, passwordHash, provider, createdAt, updatedAt, role)
    VALUES (?, ?, ?, ?, 'email', ?, ?, ?)
  `);

  const stmtDoc = db.prepare(`
    INSERT OR REPLACE INTO documents (id, ownerId, collectionName, projectId, data, createdAt, updatedAt, version)
    VALUES (?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const usersToInsert = [];
  const docsToInsert = [];

  // 1. Admin
  const adminEmail = 'admin@campusasthra.edu.in';
  const adminUserId = uuidv4();
  usersToInsert.push({ id: adminUserId, email: adminEmail, hash: hashAdmin, role: 'admin' });

  const adminDoc = {
    id: 'ADMIN',
    name: 'Dr. Ramesh Kumar',
    role: 'admin',
    branch: 'Administration',
    email: adminEmail,
    phone: '9900000001',
    faceId: null,
    joinDate: '2005-06-01',
    _id: 'ADMIN',
    _ownerId: OWNER_ID,
    _projectId: PROJECT_ID,
    _createdAt: now,
    _updatedAt: now
  };
  docsToInsert.push({ id: 'ADMIN', col: 'users', data: JSON.stringify(adminDoc) });

  // 2. Teachers (500)
  let _tSeq = 1;
  const teachersMap = {};
  for (const [branch, count] of Object.entries(BRANCH_TEACHERS)) {
    for (let i = 0; i < count; i++, _tSeq++) {
      const id = 'T' + String(_tSeq).padStart(3, '0');
      const email = `${id.toLowerCase()}@campusasthra.edu.in`;
      usersToInsert.push({ id: uuidv4(), email, hash: hashTeach, role: 'teacher' });

      const tchDoc = {
        id,
        name: _name(_tSeq * 3, _tSeq * 7),
        branch,
        role: 'teacher',
        department: `${branch} Department`,
        designation: DESIG[_tSeq % DESIG.length],
        subject: 'General Studies',
        semester: 1 + ((_tSeq - 1) % 8),
        email,
        phone: _phone(_tSeq + 100),
        qualification: QUALS[_tSeq % QUALS.length],
        experience: 2 + (_tSeq % 28),
        faceId: null,
        classesThisMonth: 14 + (_tSeq % 10),
        studentsCount: 30 + (_tSeq % 60),
        joinYear: 1996 + (_tSeq % 26),
        _id: id,
        _ownerId: OWNER_ID,
        _projectId: PROJECT_ID,
        _createdAt: now,
        _updatedAt: now
      };
      teachersMap[id] = tchDoc;
      docsToInsert.push({ id, col: 'teachers', data: JSON.stringify(tchDoc) });
    }
  }

  // 3. Students (1000)
  let _sSeq = 1;
  const studentsMap = {};
  const _sSeqPerBranch = {};
  for (const [branch, count] of Object.entries(BRANCH_STUDENTS)) {
    _sSeqPerBranch[branch] = 1;
    for (let i = 0; i < count; i++, _sSeq++) {
      const id = 'S' + String(_sSeq).padStart(4, '0');
      const email = `${id.toLowerCase()}@campusasthra.edu.in`;
      usersToInsert.push({ id: uuidv4(), email, hash: hashStudy, role: 'student' });

      const sem = 1 + ((_sSeq - 1) % 8);
      const bSeq = _sSeqPerBranch[branch]++;
      const cgpa = _cgpa(_sSeq);
      const att = _att(_sSeq);
      const sgpa = parseFloat(Math.max(0, Math.min(10, cgpa + ((_sSeq % 5) - 2) * 0.15)).toFixed(2));
      const proctorId = 'T' + String(1 + ((_sSeq - 1) % 500)).padStart(3, '0');

      const stuDoc = {
        id,
        name: _name(_sSeq * 5, _sSeq * 3),
        branch,
        semester: sem,
        section: ['A', 'B', 'C'][(_sSeq - 1) % 3],
        usn: _usn2(branch, sem, bSeq),
        phone: _phone(_sSeq + 5000),
        email,
        city: CITIES[_sSeq % CITIES.length],
        cgpa,
        sgpa,
        attendance: att,
        attPresent: Math.round(att * 0.6),
        attTotal: 60,
        feeStatus: _sSeq % 8 === 0 ? 'Pending' : _sSeq % 13 === 0 ? 'Partial' : 'Paid',
        dob: _dob2(_sSeq),
        admissionYear: 2024 - Math.floor((sem - 1) / 2),
        faceId: null,
        semHistory: Array.from({ length: sem }, (_, si) =>
          parseFloat(Math.max(5.0, Math.min(10, cgpa + ((si * 3 + _sSeq) % 7 - 3) * 0.2)).toFixed(2))
        ),
        proctorId,
        _id: id,
        _ownerId: OWNER_ID,
        _projectId: PROJECT_ID,
        _createdAt: now,
        _updatedAt: now
      };
      studentsMap[id] = stuDoc;
      docsToInsert.push({ id, col: 'students', data: JSON.stringify(stuDoc) });
    }
  }

  // 4. Parents (1000 - linked to each student)
  let _pSeq = 1;
  for (const [stuId, stu] of Object.entries(studentsMap)) {
    const pid = 'P' + String(_pSeq).padStart(4, '0');
    const email = `${pid.toLowerCase()}@campusasthra.edu.in`;
    usersToInsert.push({ id: uuidv4(), email, hash: hashParent, role: 'parent' });

    const rel = RELATIONS[_pSeq % RELATIONS.length];
    const pFirstName = PFN[_pSeq % PFN.length];
    const pLastName = LN[(_pSeq * 3) % LN.length];
    const pName = pFirstName + ' ' + pLastName;

    const parentDoc = {
      id: pid,
      name: pName,
      relation: rel,
      phone: _phone(_pSeq + 20000),
      email,
      wardId: stuId,
      wardName: stu.name,
      wardUsn: stu.usn || stuId,
      wardBranch: stu.branch,
      wardSem: stu.semester,
      role: 'parent',
      createdAt: '2024-06-01T00:00:00.000Z',
      _id: pid,
      _ownerId: OWNER_ID,
      _projectId: PROJECT_ID,
      _createdAt: now,
      _updatedAt: now
    };
    docsToInsert.push({ id: pid, col: 'parents', data: JSON.stringify(parentDoc) });
    _pSeq++;
  }

  console.log(`Starting insertion of ${usersToInsert.length} project_users and ${docsToInsert.length} documents...`);

  const insertTxn = db.transaction(() => {
    for (const u of usersToInsert) {
      stmtUser.run(u.id, PROJECT_ID, u.email, u.hash, now, now, u.role);
    }
    for (const d of docsToInsert) {
      stmtDoc.run(d.id, OWNER_ID, d.col, PROJECT_ID, d.data, now, now);
    }
  });

  insertTxn();

  console.log('Seeding completed successfully!');
  console.log('Total accounts created in project_users:', usersToInsert.length);
  console.log('Total collection documents created in AegisDB:', docsToInsert.length);
}

runSeed().catch(err => {
  console.error('Error during seeding:', err);
});
