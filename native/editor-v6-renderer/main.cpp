#include <windows.h>
#include <wincodec.h>
#include <wrl/client.h>
#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <array>
#include <chrono>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <limits>
#include <string>
#include <unordered_map>
#include <vector>

using Microsoft::WRL::ComPtr;
namespace {
constexpr std::array<char, 4> kMagic{'V', '6', 'N', 'R'};
constexpr std::uint32_t kVersion = 3;
constexpr std::uint32_t kMaxDimension = 4096;
constexpr std::uint64_t kMaxFrameBytes = 4096ull * 2160ull * 4ull;
constexpr std::uint32_t kMaxPacketBytes = 256u * 1024u * 1024u;
constexpr std::uint32_t kMaxAssetsPerFrame = 4096;
constexpr std::uint32_t kMaxCommandsPerFrame = 20000;
constexpr std::uint64_t kMaxCachedAssetBytes = 512ull * 1024ull * 1024ull;

struct Image {
  UINT width = 0;
  UINT height = 0;
  std::vector<std::uint8_t> pixels;
};
struct ImageCommand {
  std::string assetId;
  float x = 0, y = 0, width = 0, height = 0, rotation = 0, opacity = 1;
  float sourceX = 0, sourceY = 0, sourceWidth = 0, sourceHeight = 0;
  float cutoutX = 0, cutoutY = 0, cutoutWidth = 0, cutoutHeight = 0;
  bool hasSource = false, hasCutout = false, flipX = false, contain = false;
};

class Reader {
 public:
  explicit Reader(const std::vector<std::uint8_t>& bytes) : bytes_(bytes) {}
  template <typename T> T read() {
    require(sizeof(T));
    T value{};
    std::memcpy(&value, bytes_.data() + offset_, sizeof(T));
    offset_ += sizeof(T);
    return value;
  }
  std::string string16() {
    const auto length = read<std::uint16_t>();
    require(length);
    std::string result(reinterpret_cast<const char*>(bytes_.data() + offset_), length);
    offset_ += length;
    return result;
  }
  std::vector<std::uint8_t> bytes32() {
    const auto length = read<std::uint32_t>();
    require(length);
    std::vector<std::uint8_t> result(bytes_.begin() + static_cast<std::ptrdiff_t>(offset_), bytes_.begin() + static_cast<std::ptrdiff_t>(offset_ + length));
    offset_ += length;
    return result;
  }
  bool finished() const { return offset_ == bytes_.size(); }
 private:
  void require(std::size_t count) {
    if (count > bytes_.size() - offset_) throw std::runtime_error("Pacote do renderizador nativo truncado.");
  }
  const std::vector<std::uint8_t>& bytes_;
  std::size_t offset_ = 0;
};

void readExact(std::istream& stream, void* data, std::size_t length) {
  if (length == 0) return;
  stream.read(static_cast<char*>(data), static_cast<std::streamsize>(length));
  if (stream.gcount() != static_cast<std::streamsize>(length)) throw std::runtime_error("Fluxo do protocolo nativo encerrado no meio de um pacote.");
}
void writeExact(std::ostream& stream, const void* data, std::size_t length) {
  stream.write(static_cast<const char*>(data), static_cast<std::streamsize>(length));
  if (!stream) throw std::runtime_error("Não foi possível escrever a resposta do renderizador nativo.");
}
void writeU32(std::ostream& stream, std::uint32_t value) { writeExact(stream, &value, sizeof(value)); }

Image decodeImage(IWICImagingFactory* factory, const std::vector<std::uint8_t>& encoded) {
  if (encoded.empty() || encoded.size() > std::numeric_limits<DWORD>::max()) throw std::runtime_error("Asset nativo vazio ou grande demais.");
  ComPtr<IWICStream> stream;
  if (FAILED(factory->CreateStream(&stream)) || FAILED(stream->InitializeFromMemory(const_cast<BYTE*>(encoded.data()), static_cast<DWORD>(encoded.size())))) throw std::runtime_error("Não foi possível abrir o asset no WIC.");
  ComPtr<IWICBitmapDecoder> decoder;
  if (FAILED(factory->CreateDecoderFromStream(stream.Get(), nullptr, WICDecodeMetadataCacheOnLoad, &decoder))) throw std::runtime_error("O WIC não reconheceu o formato de imagem do asset.");
  ComPtr<IWICBitmapFrameDecode> frame;
  if (FAILED(decoder->GetFrame(0, &frame))) throw std::runtime_error("Não foi possível decodificar o quadro do asset.");
  UINT width = 0, height = 0;
  if (FAILED(frame->GetSize(&width, &height)) || width == 0 || height == 0 || static_cast<std::uint64_t>(width) * height > kMaxFrameBytes / 4) throw std::runtime_error("Dimensões do asset nativo inválidas.");
  ComPtr<IWICFormatConverter> converter;
  if (FAILED(factory->CreateFormatConverter(&converter)) || FAILED(converter->Initialize(frame.Get(), GUID_WICPixelFormat32bppPBGRA, WICBitmapDitherTypeNone, nullptr, 0, WICBitmapPaletteTypeCustom))) throw std::runtime_error("Não foi possível converter o asset para BGRA premultiplicado.");
  Image image{width, height, std::vector<std::uint8_t>(static_cast<std::size_t>(width) * height * 4)};
  if (FAILED(converter->CopyPixels(nullptr, width * 4, static_cast<UINT>(image.pixels.size()), image.pixels.data()))) throw std::runtime_error("Falha ao copiar pixels do asset para o renderizador nativo.");
  return image;
}

std::uint8_t channel(float value) { return static_cast<std::uint8_t>(std::clamp(std::lround(value), 0l, 255l)); }
void blendPixel(std::uint8_t* destination, const std::array<float, 4>& source, float opacity) {
  const float alpha = std::clamp(source[3] * opacity, 0.0f, 255.0f);
  const float inverse = 1.0f - alpha / 255.0f;
  for (int index = 0; index < 3; ++index) destination[index] = channel(source[index] * opacity + destination[index] * inverse);
  destination[3] = channel(alpha + destination[3] * inverse);
}

std::array<float, 4> sample(const Image& image, float x, float y, float left, float top, float width, float height) {
  const float sourceX = std::clamp(left + x * width, 0.0f, static_cast<float>(image.width - 1));
  const float sourceY = std::clamp(top + y * height, 0.0f, static_cast<float>(image.height - 1));
  const auto x0 = static_cast<UINT>(std::floor(sourceX)), y0 = static_cast<UINT>(std::floor(sourceY));
  const auto x1 = std::min(x0 + 1, image.width - 1), y1 = std::min(y0 + 1, image.height - 1);
  const float dx = sourceX - x0, dy = sourceY - y0;
  std::array<float, 4> result{};
  for (int component = 0; component < 4; ++component) {
    const auto at = [&](UINT px, UINT py) { return image.pixels[(static_cast<std::size_t>(py) * image.width + px) * 4 + component]; };
    const float upper = at(x0, y0) * (1 - dx) + at(x1, y0) * dx;
    const float lower = at(x0, y1) * (1 - dx) + at(x1, y1) * dx;
    result[component] = upper * (1 - dy) + lower * dy;
  }
  return result;
}

void drawImage(std::vector<std::uint8_t>& output, UINT outputWidth, UINT outputHeight, UINT logicalHeight, const Image& image, const ImageCommand& command) {
  if (!(command.width > 0 && command.height > 0) || command.opacity <= 0) return;
  float sourceLeft = command.hasSource ? command.sourceX : 0;
  float sourceTop = command.hasSource ? command.sourceY : 0;
  float sourceWidth = command.hasSource ? command.sourceWidth : static_cast<float>(image.width);
  float sourceHeight = command.hasSource ? command.sourceHeight : static_cast<float>(image.height);
  if (!(sourceWidth > 0 && sourceHeight > 0) || sourceLeft < 0 || sourceTop < 0 || sourceLeft + sourceWidth > image.width + 0.01f || sourceTop + sourceHeight > image.height + 0.01f) throw std::runtime_error("Recorte da imagem nativa excede o asset.");
  float targetWidth = command.width, targetHeight = command.height;
  if (command.contain) {
    const float scale = std::min(targetWidth / sourceWidth, targetHeight / sourceHeight);
    targetWidth = sourceWidth * scale; targetHeight = sourceHeight * scale;
  }
  const float scaleX = static_cast<float>(outputWidth) / 1920.0f;
  const float scaleY = static_cast<float>(outputHeight) / static_cast<float>(logicalHeight);
  const float cx = command.x * scaleX, cy = command.y * scaleY;
  const float halfW = targetWidth * scaleX / 2, halfH = targetHeight * scaleY / 2;
  const float radians = command.rotation * 0.01745329251994329577f;
  const float cosine = std::cos(radians), sine = std::sin(radians);
  const float extentX = std::abs(cosine * halfW) + std::abs(sine * halfH);
  const float extentY = std::abs(sine * halfW) + std::abs(cosine * halfH);
  const int minX = std::max(0, static_cast<int>(std::floor(cx - extentX - 1)));
  const int maxX = std::min(static_cast<int>(outputWidth) - 1, static_cast<int>(std::ceil(cx + extentX + 1)));
  const int minY = std::max(0, static_cast<int>(std::floor(cy - extentY - 1)));
  const int maxY = std::min(static_cast<int>(outputHeight) - 1, static_cast<int>(std::ceil(cy + extentY + 1)));
  if (minX > maxX || minY > maxY) return;
  for (int py = minY; py <= maxY; ++py) for (int px = minX; px <= maxX; ++px) {
    const float dx = px + 0.5f - cx, dy = py + 0.5f - cy;
    float localX = cosine * dx + sine * dy;
    const float localY = -sine * dx + cosine * dy;
    if (std::abs(localX) > halfW || std::abs(localY) > halfH) continue;
    if (command.flipX) localX = -localX;
    const float u = localX / (targetWidth * scaleX) + 0.5f;
    const float v = localY / (targetHeight * scaleY) + 0.5f;
    if (command.hasCutout && u >= command.cutoutX && u <= command.cutoutX + command.cutoutWidth && v >= command.cutoutY && v <= command.cutoutY + command.cutoutHeight) continue;
    const auto rgba = sample(image, u, v, sourceLeft, sourceTop, sourceWidth - 1, sourceHeight - 1);
    blendPixel(output.data() + (static_cast<std::size_t>(py) * outputWidth + static_cast<UINT>(px)) * 4, rgba, std::clamp(command.opacity, 0.0f, 1.0f));
  }
}

void drawSolid(std::vector<std::uint8_t>& output, UINT outputWidth, UINT outputHeight, UINT logicalHeight, float x, float y, float width, float height, std::uint32_t bgra) {
  if (!(width > 0 && height > 0)) return;
  const float scaleX = static_cast<float>(outputWidth) / 1920.0f, scaleY = static_cast<float>(outputHeight) / static_cast<float>(logicalHeight);
  const int left = std::max(0, static_cast<int>(std::floor(x * scaleX)));
  const int top = std::max(0, static_cast<int>(std::floor(y * scaleY)));
  const int right = std::min(static_cast<int>(outputWidth), static_cast<int>(std::ceil((x + width) * scaleX)));
  const int bottom = std::min(static_cast<int>(outputHeight), static_cast<int>(std::ceil((y + height) * scaleY)));
  const std::array<float, 4> color{static_cast<float>(bgra & 0xff), static_cast<float>((bgra >> 8) & 0xff), static_cast<float>((bgra >> 16) & 0xff), static_cast<float>((bgra >> 24) & 0xff)};
  for (int py = top; py < bottom; ++py) for (int px = left; px < right; ++px) blendPixel(output.data() + (static_cast<std::size_t>(py) * outputWidth + static_cast<UINT>(px)) * 4, color, 1.0f);
}

std::vector<std::uint8_t> render(const std::vector<std::uint8_t>& packet, IWICImagingFactory* factory, std::unordered_map<std::string, Image>& assets, std::uint64_t& cachedBytes) {
  Reader reader(packet);
  std::array<char, 4> magic{};
  for (auto& byte : magic) byte = reader.read<char>();
  if (magic != kMagic || reader.read<std::uint32_t>() != kVersion) throw std::runtime_error("Versão do protocolo do renderizador nativo incompatível.");
  const UINT width = reader.read<std::uint32_t>(), height = reader.read<std::uint32_t>(), logicalHeight = reader.read<std::uint32_t>();
  const std::uint32_t bgra = reader.read<std::uint32_t>();
  const auto assetCount = reader.read<std::uint32_t>(), commandCount = reader.read<std::uint32_t>();
  if (!width || !height || !logicalHeight || width > kMaxDimension || height > kMaxDimension || logicalHeight > 2160 || static_cast<std::uint64_t>(width) * height * 4 > kMaxFrameBytes || assetCount > kMaxAssetsPerFrame || commandCount > kMaxCommandsPerFrame) throw std::runtime_error("Limites de quadro do renderizador nativo excedidos.");
  std::unordered_map<std::string, Image> frameAssets;
  std::uint64_t frameAssetBytes = 0;
  for (std::uint32_t index = 0; index < assetCount; ++index) {
    const auto key = reader.string16();
    const auto lifetime = reader.read<std::uint8_t>();
    auto bytes = reader.bytes32();
    if (key.empty() || lifetime > 1) throw std::runtime_error("Asset sem identidade ou com ciclo de vida inválido no protocolo nativo.");
    if (lifetime == 1) {
      auto image = decodeImage(factory, bytes);
      const auto imageBytes = image.pixels.size();
      if (frameAssetBytes + imageBytes > kMaxCachedAssetBytes) throw std::runtime_error("Os assets temporários do quadro excederam 512 MiB no renderizador nativo.");
      frameAssetBytes += imageBytes;
      frameAssets.insert_or_assign(key, std::move(image));
    } else if (!assets.contains(key)) {
      auto image = decodeImage(factory, bytes);
      const auto imageBytes = image.pixels.size();
      if (cachedBytes + imageBytes > kMaxCachedAssetBytes) throw std::runtime_error("O conjunto de assets permanentes excedeu 512 MiB no processo de renderização nativa.");
      cachedBytes += imageBytes;
      assets.emplace(key, std::move(image));
    }
  }
  std::vector<std::uint8_t> output(static_cast<std::size_t>(width) * height * 4);
  for (std::size_t offset = 0; offset < output.size(); offset += 4) {
    output[offset] = static_cast<std::uint8_t>(bgra & 0xff);
    output[offset + 1] = static_cast<std::uint8_t>((bgra >> 8) & 0xff);
    output[offset + 2] = static_cast<std::uint8_t>((bgra >> 16) & 0xff);
    output[offset + 3] = static_cast<std::uint8_t>((bgra >> 24) & 0xff);
  }
  for (std::uint32_t index = 0; index < commandCount; ++index) {
    const auto type = reader.read<std::uint8_t>();
    const auto flags = reader.read<std::uint8_t>();
    (void)reader.read<std::uint16_t>();
    if (type == 2) {
      const float x = reader.read<float>(), y = reader.read<float>(), rectWidth = reader.read<float>(), rectHeight = reader.read<float>();
      const auto color = reader.read<std::uint32_t>();
      drawSolid(output, width, height, logicalHeight, x, y, rectWidth, rectHeight, color);
      continue;
    }
    if (type != 1) throw std::runtime_error("Tipo de comando ainda não suportado pelo renderizador nativo.");
    ImageCommand command;
    command.flipX = (flags & 1) != 0; command.contain = (flags & 2) != 0; command.hasSource = (flags & 4) != 0; command.hasCutout = (flags & 8) != 0;
    command.x = reader.read<float>(); command.y = reader.read<float>(); command.width = reader.read<float>(); command.height = reader.read<float>(); command.rotation = reader.read<float>(); command.opacity = reader.read<float>();
    command.sourceX = reader.read<float>(); command.sourceY = reader.read<float>(); command.sourceWidth = reader.read<float>(); command.sourceHeight = reader.read<float>();
    command.cutoutX = reader.read<float>(); command.cutoutY = reader.read<float>(); command.cutoutWidth = reader.read<float>(); command.cutoutHeight = reader.read<float>();
    command.assetId = reader.string16();
    const auto frameAsset = frameAssets.find(command.assetId);
    if (frameAsset != frameAssets.end()) {
      drawImage(output, width, height, logicalHeight, frameAsset->second, command);
      continue;
    }
    const auto processAsset = assets.find(command.assetId);
    if (processAsset == assets.end()) throw std::runtime_error("O comando referencia um asset ainda não enviado ao processo nativo.");
    drawImage(output, width, height, logicalHeight, processAsset->second, command);
  }
  if (!reader.finished()) throw std::runtime_error("O pacote do renderizador contém dados excedentes.");
  return output;
}
}

int main() {
  SetConsoleOutputCP(CP_UTF8);
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
  const HRESULT comResult = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  if (FAILED(comResult)) return 2;
  ComPtr<IWICImagingFactory> factory;
  const HRESULT factoryResult = CoCreateInstance(CLSID_WICImagingFactory, nullptr, CLSCTX_INPROC_SERVER, IID_PPV_ARGS(&factory));
  if (FAILED(factoryResult)) { CoUninitialize(); return 3; }
  std::unordered_map<std::string, Image> assets;
  std::uint64_t cachedBytes = 0;
  std::cin.sync_with_stdio(false); std::cout.sync_with_stdio(false);
  try {
    while (true) {
      std::uint32_t packetLength = 0;
      std::cin.read(reinterpret_cast<char*>(&packetLength), sizeof(packetLength));
      if (std::cin.gcount() == 0) break;
      if (std::cin.gcount() != sizeof(packetLength) || packetLength < 32 || packetLength > kMaxPacketBytes) throw std::runtime_error("Tamanho de pacote inválido no protocolo do renderizador.");
      std::vector<std::uint8_t> packet(packetLength);
      readExact(std::cin, packet.data(), packet.size());
      const auto renderStarted = std::chrono::steady_clock::now();
      try {
        const auto pixels = render(packet, factory.Get(), assets, cachedBytes);
        const auto elapsedMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - renderStarted).count();
        writeU32(std::cout, 0); writeU32(std::cout, static_cast<std::uint32_t>(pixels.size())); writeExact(std::cout, &elapsedMilliseconds, sizeof(elapsedMilliseconds)); writeExact(std::cout, pixels.data(), pixels.size());
      } catch (const std::exception& error) {
        const std::string message(error.what());
        const auto elapsedMilliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - renderStarted).count();
        writeU32(std::cout, 1); writeU32(std::cout, static_cast<std::uint32_t>(message.size())); writeExact(std::cout, &elapsedMilliseconds, sizeof(elapsedMilliseconds)); writeExact(std::cout, message.data(), message.size());
      }
      std::cout.flush();
    }
  } catch (const std::exception& error) {
    const std::string message = std::string("native-renderer fatal: ") + error.what() + "\n";
    writeExact(std::cerr, message.data(), message.size());
  }
  assets.clear();
  CoUninitialize();
  return 0;
}
