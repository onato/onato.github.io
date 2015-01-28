module Jekyll
  module ModificationDate
    def file_date(input)
      File.mtime(input)
    end
  end
end

Liquid::Template.register_filter(Jekyll::ModificationDate)