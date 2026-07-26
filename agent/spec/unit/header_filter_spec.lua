describe("header_filter", function()
  local header_filter

  local function reload()
    package.loaded["header_filter"] = nil
    package.loaded["agent_pub"] = nil
    header_filter = require("header_filter")
  end

  it("clears content_length when need_replace", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "text/html", content_length = "123" },
    })
    reload()
    header_filter.run()
    assert.is_nil(ngx.header.content_length)
    ngx_mock.mark_branch("header_filter.clear_content_length")
  end)

  it("ignores when need_replace is false", function()
    ngx_mock.setup({
      var = { uri = "/page" },
      header = { ["Content-Type"] = "application/json", content_length = "10" },
    })
    reload()
    header_filter.run()
    assert.are.equal("10", ngx.header.content_length)
    ngx_mock.mark_branch("header_filter.ignore")
  end)
end)
