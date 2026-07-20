<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

Route::get('/test', function () {
    return response()->json(['message' => 'Laravel backend is connected!']);
});

Route::get('/inventory', function () {
return response()->json([]);
});

Route::get('/sales', function () {
return response()->json([]);
});

