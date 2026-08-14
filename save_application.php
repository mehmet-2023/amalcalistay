<?php
header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *'); // Allow CORS for React app
header('Access-Control-Allow-Methods: POST');
header('Access-Control-Allow-Headers: Content-Type');

// Database configuration
$servername = "sql200.infinityfree.com:3306";
$username = "if0_39474422"; 
$password = "xdxd3162"; 
$dbname = "if0_39474422_amal2026";

// Create database connection
$conn = new mysqli($servername, $username, $password);

// Check connection
if ($conn->connect_error) {
    echo json_encode(['status' => 'error', 'message' => 'Connection failed: ' . $conn->connect_error]);
    exit();
}

// Create database if it doesn't exist
$conn->query("CREATE DATABASE IF NOT EXISTS $dbname");
$conn->select_db($dbname);

// Create applications table if it doesn't exist
$sql = "CREATE TABLE IF NOT EXISTS applications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    organization VARCHAR(255),
    motivation TEXT,
    mediaOutlet VARCHAR(255),
    pressCard VARCHAR(255),
    role VARCHAR(255),
    experience TEXT,
    interest VARCHAR(255),
    expectations TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
)";
if (!$conn->query($sql)) {
    echo json_encode(['status' => 'error', 'message' => 'Table creation failed: ' . $conn->error]);
    exit();
}

// Handle POST request
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Get raw POST data
    $input = json_decode(file_get_contents('php://input'), true);
    
    if (!$input) {
        echo json_encode(['status' => 'error', 'message' => 'Invalid input data']);
        exit();
    }

    // Sanitize inputs
    $type = $conn->real_escape_string($input['type'] ?? '');
    $name = $conn->real_escape_string($input['name'] ?? '');
    $email = $conn->real_escape_string($input['email'] ?? '');
    $organization = $conn->real_escape_string($input['organization'] ?? '');
    $motivation = $conn->real_escape_string($input['motivation'] ?? '');
    $mediaOutlet = $conn->real_escape_string($input['mediaOutlet'] ?? '');
    $pressCard = $conn->real_escape_string($input['pressCard'] ?? '');
    $role = $conn->real_escape_string($input['role'] ?? '');
    $experience = $conn->real_escape_string($input['experience'] ?? '');
    $interest = $conn->real_escape_string($input['interest'] ?? '');
    $expectations = $conn->real_escape_string($input['expectations'] ?? '');

    // Prepare SQL statement
    $sql = "INSERT INTO applications (type, name, email, organization, motivation, mediaOutlet, pressCard, role, experience, interest, expectations)
            VALUES ('$type', '$name', '$email', '$organization', '$motivation', '$mediaOutlet', '$pressCard', '$role', '$experience', '$interest', '$expectations')";

    if ($conn->query($sql) === TRUE) {
        echo json_encode(['status' => 'success', 'message' => 'Application submitted successfully']);
    } else {
        echo json_encode(['status' => 'error', 'message' => 'Error: ' . $conn->error]);
    }
} else {
    echo json_encode(['status' => 'error', 'message' => 'Invalid request method']);
}

// Close connection
$conn->close();
?>