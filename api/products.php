<?php
// api/products.php
header('Content-Type: application/json');
// Allow CORS for dev (adjust origin in production)
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit;
}

require_once __DIR__ . '/db.php';

// read raw input for PUT/DELETE as JSON
$method = $_SERVER['REQUEST_METHOD'];

if ($method === 'GET') {
    // optional: /api/products.php?id=1 or /api/products.php (all)
    if (!empty($_GET['id'])) {
        $stmt = $pdo->prepare("SELECT * FROM products WHERE id = :id");
        $stmt->execute(['id' => $_GET['id']]);
        $product = $stmt->fetch(PDO::FETCH_ASSOC);
        echo json_encode($product ?: []);
    } else {
        $stmt = $pdo->query("SELECT * FROM products ORDER BY id DESC");
        $products = $stmt->fetchAll(PDO::FETCH_ASSOC);
        echo json_encode($products);
    }
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if ($method === 'POST') {

    // Jika upload file gambar
    $image = null;
    if (!empty($_FILES['image']['name'])) {

        $allowed = ['jpg', 'jpeg', 'png'];
        $ext = strtolower(pathinfo($_FILES['image']['name'], PATHINFO_EXTENSION));

        if (!in_array($ext, $allowed)) {
            echo json_encode(['error' => true, 'message' => 'Format file tidak valid']);
            exit;
        }

        $filename = uniqid("img_") . "." . $ext;
        $destination = "../uploads/" . $filename;

        if (!move_uploaded_file($_FILES['image']['tmp_name'], $destination)) {
            echo json_encode(['error' => true, 'message' => 'Gagal upload gambar']);
            exit;
        }

        $image = $filename;
    }

    $stmt = $pdo->prepare("
        INSERT INTO products (name, sku, category, price, stock, min_stock, reserved, available, location, image, status)
        VALUES (:name, :sku, :category, :price, :stock, :min_stock, :reserved, :available, :location, :image, :status)
    ");

    $stmt->execute([
        ':name' => $_POST['name'],
        ':sku' => $_POST['sku'],
        ':category' => $_POST['category'] ?? null,
        ':price' => intval($_POST['price']),
        ':stock' => intval($_POST['stock']),
        ':min_stock' => intval($_POST['min_stock']),
        ':reserved' => intval($_POST['reserved']),
        ':available' => intval($_POST['available']),
        ':location' => $_POST['location'] ?? null,
        ':image' => $image,
        ':status' => $_POST['status'],
    ]);

    echo json_encode(['success' => true, 'id' => $pdo->lastInsertId()]);
    exit;
}


if ($method === 'PUT') {
    // update product JSON must include id
    if (empty($input['id'])) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }
    $id = (int)$input['id'];
    // build dynamic update list
    $allowed = ['name','sku','category','price','stock','min_stock','reserved','available','location','image','status'];
    $set = [];
    $params = [];
    foreach ($allowed as $col) {
        if (isset($input[$col])) {
            $set[] = "$col = :$col";
            $params[":$col"] = $input[$col];
        }
    }
    if (empty($set)) {
        echo json_encode(['success' => false, 'message' => 'Nothing to update']);
        exit;
    }
    $params[':id'] = $id;
    $sql = "UPDATE products SET " . implode(',', $set) . " WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    try {
        $stmt->execute($params);
        echo json_encode(['success' => true, 'rows' => $stmt->rowCount()]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['error' => true, 'message' => $e->getMessage()]);
    }
    exit;
}

if ($method === 'DELETE') {
    // /api/products.php?id=3 OR send JSON {id:3}
    $id = null;
    if (!empty($_GET['id'])) $id = (int)$_GET['id'];
    if (empty($id) && !empty($input['id'])) $id = (int)$input['id'];
    if (empty($id)) {
        http_response_code(400);
        echo json_encode(['error' => 'Missing id']);
        exit;
    }
    $stmt = $pdo->prepare("DELETE FROM products WHERE id = :id");
    try {
        $stmt->execute([':id'=>$id]);
        echo json_encode(['success' => true, 'rows' => $stmt->rowCount()]);
    } catch (Exception $e) {
        http_response_code(400);
        echo json_encode(['error'=>true, 'message'=>$e->getMessage()]);
    }
    exit;
}

// fallback
http_response_code(405);
echo json_encode(['error' => 'Method not allowed']);
