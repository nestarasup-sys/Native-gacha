cmake_minimum_required(VERSION 3.24)
project(editor_v6_native_renderer LANGUAGES CXX)

if(NOT WIN32)
  message(FATAL_ERROR "O renderizador nativo atual usa WIC e requer Windows.")
endif()

add_executable(editor-v6-native-renderer main.cpp)
target_compile_features(editor-v6-native-renderer PRIVATE cxx_std_20)
target_compile_definitions(editor-v6-native-renderer PRIVATE UNICODE _UNICODE WIN32_LEAN_AND_MEAN NOMINMAX)
target_link_libraries(editor-v6-native-renderer PRIVATE windowscodecs ole32)
if(MSVC)
  target_compile_options(editor-v6-native-renderer PRIVATE /W4 /WX /permissive- /EHsc)
endif()
